const { buildAddOwnerText, buildAlertText } = require("../utils/reply-builder");
const { normalizePhoneNumber } = require("../utils/jid");

const executeAddOwnerCommand = async (ctx) => {
  if (ctx.args.length < 1) {
    await ctx.reply(
      buildAlertText(ctx.config.botName, "Format Addowner Salah", [
        `Gunakan: ${ctx.prefix}addowner <nomor>`,
        `Contoh: ${ctx.prefix}addowner 628123456789`
      ])
    );
    return;
  }

  const phoneNumber = normalizePhoneNumber(ctx.args[0]);
  if (!phoneNumber) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Nomor Owner Tidak Valid", ["Gunakan nomor owner yang benar."]));
    return;
  }

  try {
    const result =
      typeof ctx.config.addOwnerNumber === "function"
        ? await ctx.config.addOwnerNumber(phoneNumber)
        : (() => {
            if (!Array.isArray(ctx.config.ownerNumbers)) {
              ctx.config.ownerNumbers = [];
            }

            const exists = ctx.config.ownerNumbers.includes(phoneNumber);
            if (!exists) {
              ctx.config.ownerNumbers = [...ctx.config.ownerNumbers, phoneNumber];
            }

            return {
              added: !exists,
              phoneNumber,
              ownerNumbers: [...ctx.config.ownerNumbers]
            };
          })();

    await ctx.reply(
      buildAddOwnerText(
        ctx.config.botName,
        result.phoneNumber,
        result.added,
        result.ownerNumbers.length
      )
    );
  } catch (error) {
    await ctx.reply(buildAlertText(ctx.config.botName, "Addowner Gagal", [error.message || "Gagal menambahkan owner."]));
  }
};

module.exports = {
  executeAddOwnerCommand
};
