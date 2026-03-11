const { buildAlertText } = require("./reply-builder");

const requireRegisteredUser = async (ctx, phoneNumber = ctx.senderNumber) => {
  const user = ctx.db.getUserByPhone(phoneNumber);
  if (user) {
    return user;
  }

  await ctx.reply(
    buildAlertText(ctx.config.botName, "Belum Terdaftar", [
      `Gunakan ${ctx.prefix}regis terlebih dahulu.`
    ])
  );
  return null;
};

const requireOwnerOrAdmin = async (ctx) => {
  if (ctx.isOwner || (ctx.isGroup && ctx.isAdmin)) {
    return true;
  }

  await ctx.reply(
    buildAlertText(ctx.config.botName, "Akses Ditolak", [
      "Command ini hanya untuk owner bot atau admin group."
    ])
  );
  return false;
};

module.exports = {
  requireRegisteredUser,
  requireOwnerOrAdmin
};
