const { buildAddCoinText, buildAlertText } = require("../utils/reply-builder");
const { resolveTargetFromContext } = require("../utils/command-target");
const { AMOUNT_FORMAT_HINT, parseCoinAmount } = require("../utils/coin-amount");

const executeAddCoinCommand = async (ctx) => {
  if (ctx.args.length < 2) {
    await ctx.reply(
      buildAlertText(ctx.config.botName, "Format Addcoin Salah", [
        `Gunakan: ${ctx.prefix}addcoin <@mention|UserID> <jumlah>`,
        `Contoh: ${ctx.prefix}addcoin 7 100k`
      ])
    );
    return;
  }

  let amount;
  try {
    amount = parseCoinAmount(ctx.args[ctx.args.length - 1]);
  } catch (error) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Jumlah Tidak Valid", [AMOUNT_FORMAT_HINT]));
    return;
  }

  const target = resolveTargetFromContext(ctx, ctx.args[0]);
  const targetKey = target.phoneNumber || target.primaryId;
  if (!targetKey) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Target Tidak Valid", ["Gunakan mention atau UserID yang benar."]));
    return;
  }

  let updatedUser;
  try {
    updatedUser = await ctx.db.addCoinsToUser(targetKey, amount, ctx.senderNumber);
  } catch (error) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Addcoin Gagal", [error.message || "Gagal menambahkan coin."]));
    return;
  }

  await ctx.reply(buildAddCoinText(ctx.config.botName, updatedUser, amount));
};

module.exports = {
  executeAddCoinCommand
};
