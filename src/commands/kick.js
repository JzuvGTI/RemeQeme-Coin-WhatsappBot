const { requireOwnerOrAdmin } = require("../utils/command-access");
const { buildAlertText, buildKickText } = require("../utils/reply-builder");
const {
  jidToNumber,
  normalizePhoneNumber,
  resolveParticipantPhone,
  isAdminParticipant
} = require("../utils/jid");

const getParticipantPhone = (participant = {}, participants = []) => {
  const candidates = [
    participant.jid,
    participant.phoneNumber,
    participant.participantPn,
    participant.phone_number,
    participant.pn,
    participant.id,
    participant.lid
  ];

  for (const candidate of candidates) {
    const phoneNumber = resolveParticipantPhone(candidate, participants);
    if (phoneNumber) {
      return phoneNumber;
    }
  }

  return "";
};

const mapKickError = (error) => {
  const message = String(error?.message || "");
  if (/403|not-authorized|not authorized|forbidden/i.test(message)) {
    return "Bot harus admin dan target harus bisa dikeluarkan.";
  }

  if (/admin|superadmin/i.test(message)) {
    return "Target admin tidak bisa dikeluarkan oleh bot saat ini.";
  }

  return message || "Gagal mengeluarkan member dari group.";
};

const executeKickCommand = async (ctx) => {
  const allowed = await requireOwnerOrAdmin(ctx);
  if (!allowed) {
    return;
  }

  if (!ctx.isGroup) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Akses Ditolak", ["Command ini hanya bisa dipakai di group."]));
    return;
  }

  if (ctx.mentionedJids.length !== 1) {
    await ctx.reply(
      buildAlertText(ctx.config.botName, "Format Kick Salah", [
        `Gunakan: ${ctx.prefix}kick @mention`,
        "Tag 1 member yang ingin dikeluarkan."
      ])
    );
    return;
  }

  const participants = ctx.groupMetadata?.participants || [];
  const targetPhone = resolveParticipantPhone(ctx.mentionedJids[0], participants);
  if (!targetPhone) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Target Tidak Valid", ["Mention target tidak ditemukan di group."]));
    return;
  }

  const targetParticipant = participants.find((participant) => getParticipantPhone(participant, participants) === targetPhone);
  if (!targetParticipant) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Target Tidak Ditemukan", ["Member target tidak ada di group ini."]));
    return;
  }

  if (ctx.config.ownerNumbers.includes(targetPhone)) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Akses Ditolak", ["Owner bot tidak bisa dikick."]));
    return;
  }

  const botPhone = normalizePhoneNumber(jidToNumber(ctx.sock.user?.id || ctx.sock.user?.jid || ""));
  const botParticipant = participants.find((participant) => getParticipantPhone(participant, participants) === botPhone);
  const botIsAdmin = isAdminParticipant(botParticipant || {});

  if (!botPhone || !botIsAdmin) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Akses Ditolak", ["Bot harus menjadi admin group untuk kick member."]));
    return;
  }

  if (targetPhone === botPhone) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Akses Ditolak", ["Bot tidak bisa kick dirinya sendiri."]));
    return;
  }

  try {
    await ctx.sock.groupParticipantsUpdate(ctx.chatId, [`${targetPhone}@s.whatsapp.net`], "remove");
    await ctx.reply(
      buildKickText(
        ctx.config.botName,
        ctx.groupMetadata?.subject ? targetParticipant.notify || targetParticipant.name || targetPhone : targetPhone,
        targetPhone,
        ctx.groupMetadata?.subject || ""
      )
    );
  } catch (error) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Kick Gagal", [mapKickError(error)]));
  }
};

module.exports = {
  executeKickCommand
};
