const { buildAlertText, buildUseChampText } = require("../utils/reply-builder");
const { requireRegisteredUser } = require("../utils/command-access");

const executeUseCommand = async (ctx) => {
  const user = await requireRegisteredUser(ctx);
  if (!user) {
    return;
  }

  const itemCode = String(ctx.args[0] || "").trim().toLowerCase();
  if (itemCode !== "champ") {
    await ctx.reply(
      buildAlertText(ctx.config.botName, "Format Use Salah", [
        `Gunakan: ${ctx.prefix}use champ`
      ])
    );
    return;
  }

  try {
    const updatedUser = await ctx.db.useChamp(user.phoneNumber);
    await ctx.reply(buildUseChampText(ctx.config.botName, updatedUser));
  } catch (error) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Use Item Gagal", [error.message || "Item gagal digunakan."]));
  }
};

module.exports = {
  executeUseCommand
};
