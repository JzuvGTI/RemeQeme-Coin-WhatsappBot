const { buildAlertText, buildRemoveCoinText } = require("../utils/reply-builder");
const { resolveTargetFromContext } = require("../utils/command-target");
const { AMOUNT_FORMAT_HINT, parseCoinAmount } = require("../utils/coin-amount");

const executeRemoveCoinCommand = async (ctx) => {
  if (ctx.args.length < 2) {
    await ctx.reply(
      buildAlertText(ctx.config.botName, "Format Removecoin Salah", [
        `Gunakan: ${ctx.prefix}removecoin <@mention|UserID> <jumlah>`,
        `Contoh: ${ctx.prefix}removecoin 7 1k`
      ])
    );
    return;
  }

  let amount;
  try {
    amount = parseCoinAmount(ctx.args[ctx.args.length - 1]);
  } catch {
    await ctx.reply(buildAlertText(ctx.config.botName, "Jumlah Tidak Valid", [AMOUNT_FORMAT_HINT]));
    return;
  }

  const target = resolveTargetFromContext(ctx, ctx.args[0]);
  const targetKey = target.phoneNumber || target.primaryId;
  if (!targetKey) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Target Tidak Valid", ["Gunakan mention atau UserID yang benar."]));
    return;
  }

  try {
    const updatedUser = await ctx.db.removeCoinsFromUser(targetKey, amount, ctx.senderNumber);
    await ctx.reply(buildRemoveCoinText(ctx.config.botName, updatedUser, amount));
  } catch (error) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Removecoin Gagal", [error.message || "Gagal mengurangi coin."]));
  }
};

module.exports = {
  executeRemoveCoinCommand
};
