const { buildMenuText } = require("../utils/reply-builder");

const executeHelpCommand = async (ctx) => {
  await ctx.reply(buildMenuText(ctx.config.botName, ctx.config.prefixes));
};

module.exports = {
  executeHelpCommand
};
