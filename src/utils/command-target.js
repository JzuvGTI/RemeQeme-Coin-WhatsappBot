const { normalizePrimaryId } = require("../core/json-db");
const { normalizePhoneNumber, resolveParticipantPhone } = require("./jid");

const resolveTargetFromContext = (ctx, rawValue = ctx.args[0]) => {
  if (Array.isArray(ctx.mentionedJids) && ctx.mentionedJids.length > 0) {
    const phoneNumber = resolveParticipantPhone(
      ctx.mentionedJids[0],
      ctx.groupMetadata?.participants || []
    );

    return {
      mode: "mention",
      phoneNumber,
      primaryId: null,
      rawValue
    };
  }

  const primaryId = normalizePrimaryId(rawValue);
  if (primaryId) {
    return {
      mode: "userId",
      phoneNumber: "",
      primaryId,
      rawValue
    };
  }

  const phoneNumber = normalizePhoneNumber(rawValue);
  if (phoneNumber) {
    return {
      mode: "phone",
      phoneNumber,
      primaryId: null,
      rawValue
    };
  }

  return {
    mode: "invalid",
    phoneNumber: "",
    primaryId: null,
    rawValue
  };
};

const resolveUserFromTarget = (db, target) => {
  if (target.primaryId) {
    return db.getUserByPrimaryId(target.primaryId);
  }

  if (target.phoneNumber) {
    return db.getUserByPhone(target.phoneNumber);
  }

  return null;
};

module.exports = {
  resolveTargetFromContext,
  resolveUserFromTarget
};
