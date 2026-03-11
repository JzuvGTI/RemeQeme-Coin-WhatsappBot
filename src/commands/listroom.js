const { buildListRoomText } = require("../utils/reply-builder");

const executeListRoomCommand = async (ctx) => {
  await ctx.db.sweepExpiredPvpRooms();
  const rooms = ctx.db.getWaitingPvpRooms();
  await ctx.reply(buildListRoomText(ctx.config.botName, rooms));
};

module.exports = {
  executeListRoomCommand
};
