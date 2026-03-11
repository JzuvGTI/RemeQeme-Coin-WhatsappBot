const { DEFAULT_REASON, normalizeReason } = require("../utils/time");
const { buildAlertText, buildUnbanText } = require("../utils/reply-builder");
const { requireOwnerOrAdmin } = require("../utils/command-access");
const { resolveTargetFromContext, resolveUserFromTarget } = require("../utils/command-target");

const executeUnbanCommand = async (ctx) => {
  const allowed = await requireOwnerOrAdmin(ctx);
  if (!allowed) {
    return;
  }

  if (ctx.args.length < 1) {
    await ctx.reply(
      buildAlertText(ctx.config.botName, "Format Unban Salah", [
        `Gunakan: ${ctx.prefix}unban <@mention|UserID> [reason]`,
        `Contoh: ${ctx.prefix}unban 7 clear`
      ])
    );
    return;
  }

  const target = resolveTargetFromContext(ctx, ctx.args[0]);
  if (target.mode === "invalid") {
    await ctx.reply(buildAlertText(ctx.config.botName, "Target Tidak Valid", ["Gunakan mention atau UserID yang benar."]));
    return;
  }

  const targetUser = resolveUserFromTarget(ctx.db, target);
  if (!targetUser) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Target Tidak Ditemukan", ["User target belum terdaftar."]));
    return;
  }

  const reason = normalizeReason(ctx.args.slice(1).join(" "), DEFAULT_REASON);

  try {
    const user = await ctx.db.unbanUser(targetUser.phoneNumber, reason, ctx.senderNumber);
    await ctx.reply(buildUnbanText(ctx.config.botName, user, reason));
  } catch (error) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Unban Gagal", [error.message || "Unban gagal diproses."]));
  }
};

module.exports = {
  executeUnbanCommand
};
