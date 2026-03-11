const extractTextFromMessage = (message = {}) => {
  if (!message || typeof message !== "object") {
    return "";
  }

  if (typeof message.conversation === "string") {
    return message.conversation;
  }

  if (message.extendedTextMessage?.text) {
    return message.extendedTextMessage.text;
  }

  if (message.imageMessage?.caption) {
    return message.imageMessage.caption;
  }

  if (message.videoMessage?.caption) {
    return message.videoMessage.caption;
  }

  if (message.documentMessage?.caption) {
    return message.documentMessage.caption;
  }

  if (message.buttonsResponseMessage?.selectedButtonId) {
    return message.buttonsResponseMessage.selectedButtonId;
  }

  if (message.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return message.listResponseMessage.singleSelectReply.selectedRowId;
  }

  if (message.templateButtonReplyMessage?.selectedId) {
    return message.templateButtonReplyMessage.selectedId;
  }

  return "";
};

const extractMentionedJids = (message = {}) => {
  if (!message || typeof message !== "object") {
    return [];
  }

  const contextSources = [
    message.extendedTextMessage?.contextInfo,
    message.imageMessage?.contextInfo,
    message.videoMessage?.contextInfo,
    message.documentMessage?.contextInfo,
    message.buttonsResponseMessage?.contextInfo,
    message.listResponseMessage?.contextInfo,
    message.templateButtonReplyMessage?.contextInfo
  ];

  return Array.from(
    new Set(
      contextSources
        .flatMap((context) => (Array.isArray(context?.mentionedJid) ? context.mentionedJid : []))
        .filter(Boolean)
    )
  );
};

const parseCommand = (text, prefixes = ["/", ".", "!"]) => {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }

  const matchedPrefix = prefixes.find((prefix) => raw.startsWith(prefix));
  if (!matchedPrefix) {
    return null;
  }

  const withoutPrefix = raw.slice(matchedPrefix.length).trim();
  if (!withoutPrefix) {
    return null;
  }

  const parts = withoutPrefix.split(/\s+/);
  const command = (parts.shift() || "").toLowerCase();
  const args = parts;

  if (!command) {
    return null;
  }

  return {
    prefix: matchedPrefix,
    command,
    args,
    raw,
    body: withoutPrefix
  };
};

module.exports = {
  extractTextFromMessage,
  extractMentionedJids,
  parseCommand
};
