const { getShopItem } = require("../constants/shop");
const { buildAlertText, buildBuyText } = require("../utils/reply-builder");
const { requireRegisteredUser } = require("../utils/command-access");

const executeBuyCommand = async (ctx) => {
  const user = await requireRegisteredUser(ctx);
  if (!user) {
    return;
  }

  const itemCode = String(ctx.args[0] || "").trim().toLowerCase();
  const amount = ctx.args[1] ? Number.parseInt(String(ctx.args[1]), 10) : 1;

  if (!itemCode) {
    await ctx.reply(
      buildAlertText(ctx.config.botName, "Format Buy Salah", [
        `Gunakan: ${ctx.prefix}buy <item> [amount]`,
        `Contoh: ${ctx.prefix}buy champ 2`
      ])
    );
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Jumlah Tidak Valid", ["Gunakan angka lebih dari 0."]));
    return;
  }

  const item = getShopItem(itemCode);
  if (!item) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Item Tidak Ditemukan", ["Gunakan /shop untuk melihat item yang tersedia."]));
    return;
  }

  try {
    const result = await ctx.db.buyItem(user.phoneNumber, item.code, amount, item.price);
    await ctx.reply(buildBuyText(ctx.config.botName, result.user, item, result.amount, result.totalCost));
  } catch (error) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Pembelian Gagal", [error.message || "Pembelian gagal diproses."]));
  }
};

module.exports = {
  executeBuyCommand
};
