const ALL_NUMBERS = Array.from({ length: 37 }, (_, index) => index);
const SPECIAL_VALUES = [33, 34, 35, 36, 0];
const OTHER_VALUES = ALL_NUMBERS.filter((value) => !SPECIAL_VALUES.includes(value));
const OTHER_WEIGHT = 58 / OTHER_VALUES.length;

const clampRandom = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  if (numeric <= 0) {
    return 0;
  }

  if (numeric >= 1) {
    return 0.999999999999;
  }

  return numeric;
};

const pickWeightedValue = (random, entries) => {
  const threshold = clampRandom(random()) * 100;
  let cursor = 0;

  for (const entry of entries) {
    cursor += entry.weight;
    if (threshold < cursor) {
      return entry.value;
    }
  }

  return entries[entries.length - 1].value;
};

const createBoostedEntries = () => {
  const entries = [
    { value: 33, weight: 10 },
    { value: 34, weight: 10 },
    { value: 35, weight: 10 },
    { value: 36, weight: 10 },
    { value: 0, weight: 2 }
  ];

  for (const value of OTHER_VALUES) {
    entries.push({ value, weight: OTHER_WEIGHT });
  }

  return entries;
};

const BOOSTED_ENTRIES = createBoostedEntries();

const rollRoulette = (random = Math.random, boosted = false) => {
  if (!boosted) {
    return Math.floor(clampRandom(random()) * 37);
  }

  return pickWeightedValue(random, BOOSTED_ENTRIES);
};

module.exports = {
  ALL_NUMBERS,
  SPECIAL_VALUES,
  rollRoulette
};
