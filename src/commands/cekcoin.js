const { resolveTargetFromContext, resolveUserFromTarget } = require("../utils/command-target");
const { formatCoins } = require("../utils/reply-builder");

const buildPlainCoinText = (user, self = false) => {
  if (self) {
    return `Coin kamu: ${formatCoins(user.coins)}`;
  }

  return `Coin ${user.displayName} (UserID: ${user.primaryId}): ${formatCoins(user.coins)}`;
};

const executeCheckCoinCommand = async (ctx) => {
  if (!ctx.args.length && ctx.mentionedJids.length === 0) {
    const user = ctx.db.getUserByPhone(ctx.senderNumber);
    if (!user) {
      await ctx.reply(`Kamu belum terdaftar. Gunakan ${ctx.prefix}regis terlebih dahulu.`);
      return;
    }

    await ctx.reply(buildPlainCoinText(user, true));
    return;
  }

  if (ctx.mentionedJids.length > 0 && !ctx.groupMetadata && ctx.isGroup) {
    ctx.groupMetadata = await ctx.sock.groupMetadata(ctx.chatId).catch(() => null);
  }

  const target = resolveTargetFromContext(ctx, ctx.args[0]);
  if (target.mode === "invalid") {
    await ctx.reply(`Gunakan: ${ctx.prefix}cekcoin [UserID/@mention]`);
    return;
  }

  const user = resolveUserFromTarget(ctx.db, target);
  if (!user) {
    await ctx.reply("Target belum terdaftar.");
    return;
  }

  await ctx.reply(buildPlainCoinText(user, user.phoneNumber === ctx.senderNumber));
};

module.exports = {
  executeCheckCoinCommand
};
