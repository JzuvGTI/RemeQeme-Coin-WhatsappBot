const { executeHelpCommand } = require("./help");
const { executeRegisCommand } = require("./regis");
const { executeAddCoinCommand } = require("./addcoin");
const { executeAddOwnerCommand } = require("./addowner");
const { executeProfileCommand } = require("./profile");
const { executeCheckCoinCommand } = require("./cekcoin");
const { executeInfoGroupCommand } = require("./infogroup");
const { executeRemoveCoinCommand } = require("./removecoin");
const { executeTfCoinCommand } = require("./tfcoin");
const { executeSpinCommand } = require("./spin");
const { executePvpCommand } = require("./pvp");
const { executeLeaderboardCommand } = require("./leaderboard");
const { executeListRoomCommand } = require("./listroom");
const { executeShopCommand } = require("./shop");
const { executeBuyCommand } = require("./buy");
const { executeUseCommand } = require("./use");
const { executeKickCommand } = require("./kick");
const { executeBanCommand } = require("./ban");
const { executeUnbanCommand } = require("./unban");
const { executeTopupCommand } = require("./topup");

const commandMap = {
  help: {
    execute: executeHelpCommand
  },
  menu: {
    execute: executeHelpCommand
  },
  regis: {
    execute: executeRegisCommand
  },
  addcoin: {
    execute: executeAddCoinCommand,
    ownerOnly: true,
    needsGroupMetadata: false
  },
  addowner: {
    execute: executeAddOwnerCommand,
    ownerOnly: true,
    needsGroupMetadata: false
  },
  removecoin: {
    execute: executeRemoveCoinCommand,
    ownerOnly: true,
    needsGroupMetadata: false
  },
  profile: {
    execute: executeProfileCommand
  },
  cekcoin: {
    execute: executeCheckCoinCommand
  },
  cc: {
    execute: executeCheckCoinCommand
  },
  tfcoin: {
    execute: executeTfCoinCommand
  },
  pvp: {
    execute: executePvpCommand
  },
  spin: {
    execute: executeSpinCommand
  },
  gass: {
    execute: executeSpinCommand
  },
  leaderboard: {
    execute: executeLeaderboardCommand
  },
  top: {
    execute: executeLeaderboardCommand
  },
  listroom: {
    execute: executeListRoomCommand
  },
  topup: {
    execute: executeTopupCommand
  },
  shop: {
    execute: executeShopCommand
  },
  buy: {
    execute: executeBuyCommand
  },
  use: {
    execute: executeUseCommand
  },
  kick: {
    execute: executeKickCommand,
    groupOnly: true,
    needsGroupMetadata: true
  },
  ban: {
    execute: executeBanCommand,
    needsGroupMetadata: true
  },
  unban: {
    execute: executeUnbanCommand,
    needsGroupMetadata: true
  },
  infogroup: {
    execute: executeInfoGroupCommand,
    groupOnly: true,
    adminOnly: true,
    needsGroupMetadata: true
  }
};

module.exports = {
  commandMap
};
