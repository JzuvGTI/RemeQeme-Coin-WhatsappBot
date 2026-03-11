const { listShopItems } = require("../constants/shop");
const { buildShopText } = require("../utils/reply-builder");

const executeShopCommand = async (ctx) => {
  await ctx.reply(buildShopText(ctx.config.botName, listShopItems()));
};

module.exports = {
  executeShopCommand
};
