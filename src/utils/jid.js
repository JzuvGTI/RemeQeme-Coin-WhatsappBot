const DIGIT_ONLY = /\D/g;

const normalizePhoneNumber = (value) => {
  if (!value) {
    return "";
  }

  return String(value).replace(DIGIT_ONLY, "");
};

const jidToNumber = (jid) => {
  if (!jid) {
    return "";
  }

  const left = String(jid).split("@")[0] || "";
  const base = left.split(":")[0] || left;
  return normalizePhoneNumber(base);
};

const isGroupJid = (jid) => typeof jid === "string" && jid.endsWith("@g.us");

const isPrivateJid = (jid) =>
  typeof jid === "string" && (jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid"));

const isAdminParticipant = (participant = {}) =>
  participant.admin === "admin" || participant.admin === "superadmin";

const unique = (items = []) => Array.from(new Set(items.filter(Boolean)));

const preferPhoneCandidate = (candidateJids = []) => {
  const mapped = candidateJids
    .map((raw) => ({
      raw: String(raw),
      phone: jidToNumber(raw)
    }))
    .filter(({ phone }) => Boolean(phone));

  return (
    mapped.find(({ raw }) => !raw.endsWith("@lid"))?.phone ||
    mapped[0]?.phone ||
    ""
  );
};

const resolveParticipantPhone = (reference, participants = []) => {
  if (!reference) {
    return "";
  }

  const direct = jidToNumber(reference);
  if (direct && !String(reference).endsWith("@lid")) {
    return direct;
  }

  const ref = String(reference);
  for (const participant of participants) {
    const candidateJids = unique([
      participant?.jid,
      participant?.phoneNumber,
      participant?.participantPn,
      participant?.phone_number,
      participant?.pn,
      participant?.id,
      participant?.lid
    ]);
    if (!candidateJids.length) {
      continue;
    }

    if (candidateJids.includes(ref)) {
      const mapped = preferPhoneCandidate(candidateJids);
      if (mapped) {
        return mapped;
      }
    }

    if (direct && candidateJids.some((item) => jidToNumber(item) === direct)) {
      return String(reference).endsWith("@lid")
        ? preferPhoneCandidate(candidateJids)
        : direct;
    }
  }

  return String(reference).endsWith("@lid") ? "" : direct;
};

const getSenderJid = (messageKey = {}, msg = {}) =>
  messageKey.participant ||
  messageKey.participantPn ||
  msg.participant ||
  msg.participantPn ||
  messageKey.remoteJid ||
  "";

const getSenderPhoneCandidates = (msg = {}, participants = []) => {
  const key = msg?.key || {};
  const candidates = unique([
    key.participant,
    key.participantPn,
    msg.participant,
    msg.participantPn,
    isPrivateJid(key.remoteJid) ? key.remoteJid : ""
  ]);

  return unique(candidates.map((value) => resolveParticipantPhone(value, participants)));
};

module.exports = {
  normalizePhoneNumber,
  jidToNumber,
  isGroupJid,
  isPrivateJid,
  getSenderJid,
  getSenderPhoneCandidates,
  resolveParticipantPhone,
  isAdminParticipant
};
