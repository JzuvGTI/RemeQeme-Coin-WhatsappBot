const { buildAlertText, buildPlayerProfileText } = require("../utils/reply-builder");
const { requireRegisteredUser } = require("../utils/command-access");
const { resolveTargetFromContext, resolveUserFromTarget } = require("../utils/command-target");

const executeProfileCommand = async (ctx) => {
  if (!ctx.args.length && ctx.mentionedJids.length === 0) {
    const user = await requireRegisteredUser(ctx);
    if (!user) {
      return;
    }

    const rank = ctx.db.getUserRank(user.phoneNumber);
    await ctx.reply(buildPlayerProfileText(ctx.config.botName, user, rank));
    return;
  }

  if (ctx.mentionedJids.length > 0 && !ctx.groupMetadata && ctx.isGroup) {
    ctx.groupMetadata = await ctx.sock.groupMetadata(ctx.chatId).catch(() => null);
  }

  const target = resolveTargetFromContext(ctx, ctx.args[0]);
  if (target.mode === "invalid") {
    await ctx.reply(
      buildAlertText(ctx.config.botName, "Format Profile Salah", [
        `Gunakan: ${ctx.prefix}profile`,
        `Atau: ${ctx.prefix}profile <UserID>`
      ])
    );
    return;
  }

  const user = resolveUserFromTarget(ctx.db, target);
  if (!user) {
    await ctx.reply(buildAlertText(ctx.config.botName, "User Tidak Ditemukan", ["Target belum terdaftar."]));
    return;
  }

  const rank = ctx.db.getUserRank(user.phoneNumber);
  await ctx.reply(buildPlayerProfileText(ctx.config.botName, user, rank));
};

module.exports = {
  executeProfileCommand
};
