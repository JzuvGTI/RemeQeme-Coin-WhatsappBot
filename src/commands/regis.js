const { buildRegisterText } = require("../utils/reply-builder");

const executeRegisCommand = async (ctx) => {
  const result = await ctx.db.registerUser(ctx.senderNumber, ctx.senderName);
  await ctx.reply(buildRegisterText(ctx.config.botName, result.user, result.created));
};

module.exports = {
  executeRegisCommand
};
