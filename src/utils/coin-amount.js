const AMOUNT_SUFFIXES = {
  k: 1_000,
  m: 1_000_000
};

const AMOUNT_FORMAT_HINT = "Gunakan angka positif. Format: 100, 100k, 1.5m.";

const getPowerOfTen = (length) => {
  let result = 1n;
  for (let index = 0; index < length; index += 1) {
    result *= 10n;
  }

  return result;
};

const parseCoinAmount = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new Error("Jumlah coin tidak valid");
  }

  const match = raw.match(/^(\d+)(?:\.(\d+))?([kKmM])?$/);
  if (!match) {
    throw new Error("Jumlah coin tidak valid");
  }

  const [, wholePart, fractionPart = "", suffix = ""] = match;
  if (fractionPart && !suffix) {
    throw new Error("Jumlah coin tidak valid");
  }

  const multiplier = suffix ? AMOUNT_SUFFIXES[suffix.toLowerCase()] : 1;
  const numerator = BigInt(`${wholePart}${fractionPart}`);
  const denominator = getPowerOfTen(fractionPart.length);
  const scaled = numerator * BigInt(multiplier);

  if (scaled % denominator !== 0n) {
    throw new Error("Jumlah coin tidak valid");
  }

  const result = scaled / denominator;
  if (result <= 0n) {
    throw new Error("Jumlah coin tidak valid");
  }

  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Jumlah coin terlalu besar");
  }

  return Number(result);
};

module.exports = {
  AMOUNT_FORMAT_HINT,
  parseCoinAmount
};
