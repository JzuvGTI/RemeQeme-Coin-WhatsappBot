const {
  extractTextFromMessage,
  extractMentionedJids,
  parseCommand
} = require("../utils/message");
const {
  isGroupJid,
  getSenderJid,
  getSenderPhoneCandidates,
  isAdminParticipant
} = require("../utils/jid");
const { buildAlertText, buildBannedText } = require("../utils/reply-builder");

const isSenderGroupAdmin = (senderNumber, participants = []) =>
  participants.filter(isAdminParticipant).some((participant) => {
    const candidates = getSenderPhoneCandidates({ key: { participant: participant.id } }, participants);
    return candidates[0] === senderNumber;
  });

const isOwnerCandidate = (ownerNumbers = [], candidates = []) =>
  candidates.some((candidate) => ownerNumbers.includes(candidate));

const createCommandRouter = ({ sock, db, config, logger, commandMap }) => {
  const sendReply = async (chatId, msg, content) => {
    const payload =
      typeof content === "string"
        ? { text: content }
        : content && typeof content === "object"
          ? content
          : { text: String(content || "") };

    await sock.sendMessage(chatId, payload, { quoted: msg });
    return payload;
  };

  return async (msg) => {
    let audit = null;

    try {
      if (!msg?.message || msg.key?.fromMe) {
        return;
      }

      const chatId = msg.key?.remoteJid || "";
      const senderJid = getSenderJid(msg.key || {}, msg);
      const isGroup = isGroupJid(chatId);
      const mentionedJids = extractMentionedJids(msg.message);
      let senderCandidates = getSenderPhoneCandidates(msg);
      let senderNumber = senderCandidates[0] || "";
      let isOwner = isOwnerCandidate(config.ownerNumbers, senderCandidates);
      let groupMetadata = null;
      let isAdmin = false;

      const ensureGroupMetadata = async () => {
        if (!isGroup) {
          return null;
        }

        if (groupMetadata) {
          return groupMetadata;
        }

        groupMetadata = await sock.groupMetadata(chatId);
        senderCandidates = getSenderPhoneCandidates(msg, groupMetadata?.participants || []);
        senderNumber = senderCandidates[0] || senderNumber;
        isOwner = isOwnerCandidate(config.ownerNumbers, senderCandidates);
        isAdmin = isSenderGroupAdmin(senderNumber, groupMetadata?.participants || []);

        if (audit) {
          audit.senderNumber = senderNumber;
          audit.isOwner = isOwner;
          audit.groupName = groupMetadata?.subject || null;
        }

        return groupMetadata;
      };

      const text = extractTextFromMessage(msg.message);
      const parsed = parseCommand(text, config.prefixes);
      if (!parsed) {
        return;
      }

      const senderName = String(msg.pushName || "").trim() || "UNKNOWN";
      const commandWithPrefix = `${parsed.prefix}${parsed.command}`;

      audit = {
        command: parsed.command,
        commandWithPrefix,
        args: parsed.args,
        rawText: parsed.raw,
        senderName,
        senderJid,
        senderNumber,
        chatId,
        chatType: isGroup ? "group" : "private",
        isOwner
      };

      const reply = async (content, status = "reply") => {
        const payload = await sendReply(chatId, msg, content);

        logger.info(
          {
            event: "command.reply",
            status,
            ...audit,
            replyText: String(payload.text || "")
          },
          `BOT_REPLY ${commandWithPrefix} -> ${senderNumber || senderJid}`
        );
      };

      logger.info(
        {
          event: "command.received",
          ...audit
        },
        `CMD_RECEIVED ${commandWithPrefix} by ${senderName} (${senderNumber || senderJid})`
      );

      if (!isGroup && !isOwner) {
        await reply(
          buildAlertText(config.botName, "Akses Ditolak", ["Chat private hanya untuk owner bot."]),
          "denied_private_non_owner"
        );
        logger.warn(
          {
            event: "command.denied.private_non_owner",
            ...audit
          },
          `CMD_DENIED ${commandWithPrefix} private non-owner`
        );
        return;
      }

      if (isGroup && !senderNumber) {
        try {
          await ensureGroupMetadata();
        } catch {
          // handled later if still unresolved or command specifically needs metadata
        }
      }

      if (!senderNumber) {
        await reply(
          buildAlertText(config.botName, "Pengirim Tidak Valid", ["Nomor pengirim tidak dapat dibaca."]),
          "sender_resolution_failed"
        );
        logger.error(
          {
            event: "command.sender_resolution_failed",
            ...audit
          },
          `CMD_ERROR ${commandWithPrefix} sender unresolved`
        );
        return;
      }

      audit.senderNumber = senderNumber;
      audit.isOwner = isOwner;

      const senderState = await db.syncUserState(senderNumber, senderName);
      if (senderState.isBanned) {
        await reply(buildBannedText(config.botName, senderState.user), "denied_banned");
        logger.warn(
          {
            event: "command.denied.banned",
            ...audit
          },
          `CMD_DENIED ${commandWithPrefix} banned`
        );
        return;
      }

      const commandEntry = commandMap[parsed.command];
      if (!commandEntry) {
        await reply(
          buildAlertText(config.botName, "Command Tidak Dikenal", ["Gunakan /menu untuk melihat command."]),
          "unknown_command"
        );
        logger.warn(
          {
            event: "command.unknown",
            ...audit
          },
          `CMD_UNKNOWN ${commandWithPrefix}`
        );
        return;
      }

      if (commandEntry.groupOnly && !isGroup) {
        await reply(
          buildAlertText(config.botName, "Akses Ditolak", ["Command ini hanya bisa dipakai di group."]),
          "denied_group_only"
        );
        logger.warn(
          {
            event: "command.denied.group_only",
            ...audit
          },
          `CMD_DENIED ${commandWithPrefix} group-only`
        );
        return;
      }

      if (isGroup && (commandEntry.needsGroupMetadata || commandEntry.adminOnly || commandEntry.ownerOnly)) {
        try {
          await ensureGroupMetadata();
        } catch (error) {
          await reply(
            buildAlertText(config.botName, "Metadata Group Gagal", ["Gagal membaca metadata group."]),
            "group_metadata_error"
          );
          logger.error(
            {
              event: "command.group_metadata_error",
              ...audit,
              reason: error?.message
            },
            `CMD_ERROR ${commandWithPrefix} group metadata`
          );
          return;
        }
      }

      if (commandEntry.ownerOnly && !isOwner) {
        await reply(
          buildAlertText(config.botName, "Akses Ditolak", ["Command ini khusus owner bot."]),
          "denied_owner_only"
        );
        logger.warn(
          {
            event: "command.denied.owner_only",
            ...audit
          },
          `CMD_DENIED ${commandWithPrefix} owner-only`
        );
        return;
      }

      if (commandEntry.adminOnly && !isAdmin) {
        await reply(
          buildAlertText(config.botName, "Akses Ditolak", ["Command ini khusus admin group."]),
          "denied_admin_only"
        );
        logger.warn(
          {
            event: "command.denied.admin_only",
            ...audit
          },
          `CMD_DENIED ${commandWithPrefix} admin-only`
        );
        return;
      }

      const context = {
        sock,
        db,
        config,
        logger,
        msg,
        chatId,
        senderJid,
        senderNumber,
        senderName,
        senderUser: senderState.user,
        mentionedJids,
        isGroup,
        isOwner,
        isAdmin,
        prefix: parsed.prefix,
        command: parsed.command,
        args: parsed.args,
        rawText: parsed.raw,
        groupMetadata,
        reply
      };

      await commandEntry.execute(context);

      logger.debug(
        {
          event: "command.success",
          ...audit,
          isAdmin
        },
        `CMD_SUCCESS ${commandWithPrefix} by ${senderName} (${senderNumber || senderJid})`
      );
    } catch (error) {
      logger.error(
        {
          event: "command.unhandled_error",
          ...(audit || {}),
          reason: error?.message,
          stack: error?.stack
        },
        `CMD_ERROR ${audit?.commandWithPrefix || "unknown"}`
      );
    }
  };
};

module.exports = {
  createCommandRouter
};
