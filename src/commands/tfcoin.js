const { buildAlertText, buildTransferText } = require("../utils/reply-builder");
const { requireRegisteredUser } = require("../utils/command-access");
const { resolveTargetFromContext, resolveUserFromTarget } = require("../utils/command-target");
const { AMOUNT_FORMAT_HINT, parseCoinAmount } = require("../utils/coin-amount");

const executeTfCoinCommand = async (ctx) => {
  const senderUser = await requireRegisteredUser(ctx);
  if (!senderUser) {
    return;
  }

  if (ctx.args.length < 2) {
    await ctx.reply(
      buildAlertText(ctx.config.botName, "Format Tfcoin Salah", [
        `Gunakan: ${ctx.prefix}tfcoin <@mention|UserID> <jumlah>`,
        `Contoh: ${ctx.prefix}tfcoin 7 100k`
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

  if (ctx.mentionedJids.length > 0 && !ctx.groupMetadata && ctx.isGroup) {
    ctx.groupMetadata = await ctx.sock.groupMetadata(ctx.chatId).catch(() => null);
  }

  const target = resolveTargetFromContext(ctx, ctx.args[0]);
  if (target.mode === "invalid") {
    await ctx.reply(buildAlertText(ctx.config.botName, "Target Tidak Valid", ["Gunakan mention atau UserID yang benar."]));
    return;
  }

  const targetUser = resolveUserFromTarget(ctx.db, target);
  if (!targetUser) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Target Tidak Ditemukan", ["User tujuan belum terdaftar."]));
    return;
  }

  try {
    const result = await ctx.db.transferCoins(
      senderUser.phoneNumber,
      targetUser.phoneNumber,
      amount,
      ctx.senderNumber
    );

    await ctx.reply(buildTransferText(ctx.config.botName, result));
  } catch (error) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Transfer Gagal", [error.message || "Transfer coin gagal."]));
  }
};

module.exports = {
  executeTfCoinCommand
};
