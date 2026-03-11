const { buildAlertText, buildLeaderboardText } = require("../utils/reply-builder");

const executeLeaderboardCommand = async (ctx) => {
  try {
    const rows = ctx.db.getLeaderboard(10);
    await ctx.reply(buildLeaderboardText(ctx.config.botName, rows));
  } catch (error) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Leaderboard Gagal", [error.message || "Gagal mengambil leaderboard."]));
  }
};

module.exports = {
  executeLeaderboardCommand
};
