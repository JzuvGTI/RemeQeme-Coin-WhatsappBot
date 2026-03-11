const { DEFAULT_REASON, normalizeReason } = require("../utils/time");
const { buildAlertText, buildBanText } = require("../utils/reply-builder");
const { requireOwnerOrAdmin } = require("../utils/command-access");
const { resolveTargetFromContext, resolveUserFromTarget } = require("../utils/command-target");

const executeBanCommand = async (ctx) => {
  const allowed = await requireOwnerOrAdmin(ctx);
  if (!allowed) {
    return;
  }

  if (ctx.args.length < 2) {
    await ctx.reply(
      buildAlertText(ctx.config.botName, "Format Ban Salah", [
        `Gunakan: ${ctx.prefix}ban <@mention|UserID> <minute|-1> [reason]`,
        `Contoh: ${ctx.prefix}ban 7 30 toxic`
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

  const duration = Number.parseInt(String(ctx.args[1] || ""), 10);
  const reason = normalizeReason(ctx.args.slice(2).join(" "), DEFAULT_REASON);

  try {
    const bannedUser = await ctx.db.banUser(targetUser.phoneNumber, duration, reason, ctx.senderNumber);
    await ctx.reply(buildBanText(ctx.config.botName, bannedUser, duration, reason));
  } catch (error) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Ban Gagal", [error.message || "Ban gagal diproses."]));
  }
};

module.exports = {
  executeBanCommand
};
