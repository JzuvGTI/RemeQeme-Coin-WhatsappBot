const fs = require("fs/promises");
const path = require("path");

const { buildAlertText } = require("../utils/reply-builder");

const TOPUP_IMAGE_PATH = path.resolve(__dirname, "../../image/JzQRIS.jpg");
const TOPUP_CAPTION = "Minimum Topup Rp 2.000 silahkan scan dan kirim bukti pembayaran ke dalam grup";

const createTopupContent = async (imagePath = TOPUP_IMAGE_PATH) => {
  await fs.access(imagePath);

  return {
    image: { url: imagePath },
    caption: TOPUP_CAPTION
  };
};

const executeTopupCommand = async (ctx) => {
  try {
    const content = await createTopupContent();
    await ctx.reply(content);
  } catch (error) {
    await ctx.reply(
      buildAlertText(ctx.config.botName, "Topup Tidak Tersedia", ["Gambar QRIS tidak ditemukan."])
    );
  }
};

module.exports = {
  TOPUP_CAPTION,
  TOPUP_IMAGE_PATH,
  createTopupContent,
  executeTopupCommand
};
