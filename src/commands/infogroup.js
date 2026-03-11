const { jidToNumber, isAdminParticipant } = require("../utils/jid");
const { buildAlertText, buildInfoGroupText } = require("../utils/reply-builder");

const executeInfoGroupCommand = async (ctx) => {
  const metadata = ctx.groupMetadata;
  if (!metadata) {
    await ctx.reply(
      buildAlertText(ctx.config.botName, "Metadata Group Gagal", ["Gagal mengambil metadata group."])
    );
    return;
  }

  const participants = Array.isArray(metadata.participants) ? metadata.participants : [];
  const admins = participants.filter(isAdminParticipant);
  const adminList = admins.map((admin, index) => `${index + 1}. ${admin.id || "-"}`);
  const adminNumberList = admins.map((admin, index) => `${index + 1}. ${jidToNumber(admin.id) || admin.id}`);

  await ctx.reply(
    buildInfoGroupText(
      ctx.config.botName,
      {
        ...metadata,
        desc: metadata.desc ? String(metadata.desc).trim() : "-"
      },
      adminList,
      adminNumberList
    )
  );
};

module.exports = {
  executeInfoGroupCommand
};
