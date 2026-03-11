const {
  buildAlertText,
  buildPvpCreatedText,
  buildPvpJoinedText
} = require("../utils/reply-builder");
const { requireRegisteredUser } = require("../utils/command-access");
const { AMOUNT_FORMAT_HINT, parseCoinAmount } = require("../utils/coin-amount");
const {
  PVP_MODE_REME,
  PVP_MODE_QEME,
  PVP_MIN_BET,
  normalizePvpMode
} = require("../utils/pvp");

const buildUsageText = (botName, prefix) =>
  buildAlertText(botName, "Format PVP Salah", [
    `Buat room: ${prefix}pvp REME 1k R1`,
    `Buat room: ${prefix}pvp QEME 1k Q1`,
    `Join room: ${prefix}pvp REME R1 / ${prefix}pvp QEME Q1`
  ]);

const executePvpCommand = async (ctx) => {
  const user = await requireRegisteredUser(ctx);
  if (!user) {
    return;
  }

  await ctx.db.sweepExpiredPvpRooms();

  if (ctx.args.length < 2 || ctx.args.length > 3) {
    await ctx.reply(buildUsageText(ctx.config.botName, ctx.prefix));
    return;
  }

  const mode = normalizePvpMode(ctx.args[0]);
  if (!mode) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Mode Tidak Valid", ["Gunakan REME atau QEME."]));
    return;
  }

  if (mode !== PVP_MODE_REME && mode !== PVP_MODE_QEME) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Mode Tidak Valid", ["Gunakan mode REME atau QEME."]));
    return;
  }

  if (ctx.args.length === 3) {
    let bet;
    try {
      bet = parseCoinAmount(ctx.args[1]);
    } catch {
      await ctx.reply(buildAlertText(ctx.config.botName, "Bet Tidak Valid", [AMOUNT_FORMAT_HINT]));
      return;
    }

    if (bet < PVP_MIN_BET) {
      await ctx.reply(
        buildAlertText(ctx.config.botName, "Bet Terlalu Kecil", [`Minimal bet ${PVP_MIN_BET} coin.`])
      );
      return;
    }

    try {
      const result = await ctx.db.createPvpRoom({
        mode,
        roomCode: ctx.args[2],
        bet,
        chatId: ctx.chatId,
        creatorPhoneNumber: user.phoneNumber,
        creatorDisplayName: ctx.senderName
      });

      await ctx.reply(buildPvpCreatedText(ctx.config.botName, result.room));
    } catch (error) {
      await ctx.reply(buildAlertText(ctx.config.botName, "PVP Gagal", [error.message || "Gagal membuat room PVP."]));
    }
    return;
  }

  try {
    const result = await ctx.db.joinPvpRoom({
      mode,
      roomCode: ctx.args[1],
      chatId: ctx.chatId,
      joinerPhoneNumber: user.phoneNumber,
      joinerDisplayName: ctx.senderName
    });

    await ctx.reply(buildPvpJoinedText(ctx.config.botName, result.room));
  } catch (error) {
    await ctx.reply(buildAlertText(ctx.config.botName, "PVP Gagal", [error.message || "Gagal join room PVP."]));
  }
};

module.exports = {
  executePvpCommand
};
