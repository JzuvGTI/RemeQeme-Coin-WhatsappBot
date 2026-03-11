const PVP_MODE_REME = "REME";
const PVP_MODE_QEME = "QEME";
const PVP_MIN_BET = 1000;
const PVP_WAIT_TIMEOUT_MS = 3 * 60 * 1000;
const PVP_DUEL_TIMEOUT_MS = 3 * 60 * 1000;

const normalizePvpMode = (value) => {
  const mode = String(value || "").trim().toUpperCase();
  return mode === PVP_MODE_REME || mode === PVP_MODE_QEME ? mode : "";
};

const normalizeRoomCode = (value) => {
  const roomCode = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9]{1,20}$/.test(roomCode) ? roomCode : "";
};

const calculateRemeScore = (value) => {
  const number = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error("Hasil spin REME tidak valid");
  }

  if (number < 10) {
    return number;
  }

  const tens = Math.floor(number / 10);
  const ones = number % 10;
  return (tens + ones) % 10;
};

const getRemeRankValue = (score) => {
  const parsed = Number.parseInt(String(score ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 9) {
    throw new Error("Nilai rank REME tidak valid");
  }

  return parsed === 0 ? 10 : parsed;
};

const calculateQemeScore = (value) => {
  const number = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error("Hasil spin QEME tidak valid");
  }

  if (number === 0) {
    return 1;
  }

  if (number === 10 || number === 20 || number === 30) {
    return 10;
  }

  if (number < 10) {
    return number;
  }

  return number % 10;
};

const getQemeRankValue = (score) => {
  const parsed = Number.parseInt(String(score ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10) {
    throw new Error("Nilai rank QEME tidak valid");
  }

  return parsed;
};

module.exports = {
  PVP_MODE_REME,
  PVP_MODE_QEME,
  PVP_MIN_BET,
  PVP_WAIT_TIMEOUT_MS,
  PVP_DUEL_TIMEOUT_MS,
  normalizePvpMode,
  normalizeRoomCode,
  calculateRemeScore,
  getRemeRankValue,
  calculateQemeScore,
  getQemeRankValue
};
