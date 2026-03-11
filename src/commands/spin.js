const {
  buildAlertText,
  buildPvpTieText,
  buildPvpWinnerText
} = require("../utils/reply-builder");
const { requireRegisteredUser } = require("../utils/command-access");

const buildSpinPayload = (ctx, rawNumber, displayName = ctx.senderName) => {
  const line = ctx.isGroup
    ? `@${ctx.senderNumber} spun the wheel and got ${rawNumber} 🎡`
    : `${displayName} spun the wheel and got ${rawNumber} 🎡`;

  return ctx.isGroup
    ? {
        text: line,
        mentions: [`${ctx.senderNumber}@s.whatsapp.net`]
      }
    : line;
};

const executeSpinCommand = async (ctx) => {
  const user = await requireRegisteredUser(ctx);
  if (!user) {
    return;
  }

  await ctx.db.sweepExpiredPvpRooms();
  const activePvpRoom = ctx.db.getPvpRoomByUser(user.phoneNumber);
  if (activePvpRoom?.status === "active") {
    try {
      const result = await ctx.db.spinPvpRound(user.phoneNumber, ctx.senderName);

      if (result.type === "waiting_opponent") {
        await ctx.reply(buildSpinPayload(ctx, result.spin.rawNumber, result.actor.displayName));
        return;
      }

      if (result.type === "tie") {
        const actorSpin =
          result.room.player1.phoneNumber === user.phoneNumber
            ? result.previousRound.player1
            : result.previousRound.player2;

        await ctx.reply(buildSpinPayload(ctx, actorSpin.rawNumber, ctx.senderName));
        await ctx.reply(buildPvpTieText(ctx.config.botName, result.room, result.previousRound));
        return;
      }

      if (result.type === "win") {
        const actorSpin =
          result.player1.phoneNumber === user.phoneNumber ? result.player1Spin : result.player2Spin;

        await ctx.reply(buildSpinPayload(ctx, actorSpin.rawNumber, ctx.senderName));
        await ctx.reply(buildPvpWinnerText(ctx.config.botName, result));
        return;
      }
    } catch (error) {
      await ctx.reply(buildAlertText(ctx.config.botName, "Spin PVP Gagal", [error.message || "Spin PVP gagal diproses."]));
      return;
    }
  }

  try {
    const result = await ctx.db.spinWheel(user.phoneNumber);
    await ctx.reply(buildSpinPayload(ctx, result.result, result.user.displayName));
  } catch (error) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Spin Gagal", [error.message || "Spin gagal diproses."]));
  }
};

module.exports = {
  executeSpinCommand
};
