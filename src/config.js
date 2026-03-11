const fs = require("fs");
const path = require("path");
const { normalizePhoneNumber } = require("./utils/jid");

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), "config", "settings.json");
const DEFAULTS = Object.freeze({
  botName: "PVP DUEL BOT",
  ownerNumbers: ["6285956640569"],
  prefixes: ["/", ".", "!"],
  authDir: "./sessions",
  dbPath: "./data/database.json",
  logLevel: "info",
  baileysLogLevel: "silent",
  printQRInTerminal: true,
  uiMode: "plain",
  uiColor: true,
  uiMaxEvents: 12
});

const parseList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const parsePrefixes = (value) => {
  const tokens = parseList(value);
  const expanded = [];

  for (const token of tokens) {
    if (token.length > 1 && /^[/.!]+$/.test(token)) {
      expanded.push(...token.split(""));
      continue;
    }

    expanded.push(token);
  }

  return Array.from(new Set(expanded.filter(Boolean)));
};

const parseBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "undefined" || value === null || value === "") {
    return fallback;
  }

  return String(value).toLowerCase() === "true";
};

const parseInteger = (value, fallback) => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }

  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeOwnerNumbers = (value) =>
  Array.from(
    new Set(
      parseList(value)
        .map(normalizePhoneNumber)
        .filter(Boolean)
    )
  );

const hasArg = (flag) => process.argv.includes(flag);

const readConfigFile = (configPath) => {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw new Error(`Config JSON tidak valid di ${configPath}: ${error.message}`);
  }
};

const serializeConfig = (config) => ({
  botName: config.botName,
  ownerNumbers: [...config.ownerNumbers],
  prefixes: [...config.prefixes],
  authDir: config.authDirSetting,
  dbPath: config.dbPathSetting,
  logLevel: config.logLevel,
  baileysLogLevel: config.baileysLogLevel,
  printQRInTerminal: config.printQRInTerminal,
  uiMode: config.uiModeSetting,
  uiColor: config.uiColor,
  uiMaxEvents: config.uiMaxEvents
});

const createRuntimeConfig = (source = {}, options = {}) => {
  const configPath = path.resolve(options.configPath || DEFAULT_CONFIG_PATH);
  const raw = { ...DEFAULTS, ...source };
  const prefixes = parsePrefixes(raw.prefixes);
  const ownerNumbers = normalizeOwnerNumbers(raw.ownerNumbers);
  const uiModeSetting = String(raw.uiMode || DEFAULTS.uiMode).toLowerCase() === "dashboard"
    ? "dashboard"
    : "plain";

  const config = {
    configPath,
    botName: String(raw.botName || DEFAULTS.botName),
    ownerNumbers: ownerNumbers.length ? ownerNumbers : [...DEFAULTS.ownerNumbers],
    prefixes: prefixes.length ? prefixes : [...DEFAULTS.prefixes],
    authDirSetting: String(raw.authDir || DEFAULTS.authDir),
    dbPathSetting: String(raw.dbPath || DEFAULTS.dbPath),
    logLevel: String(raw.logLevel || DEFAULTS.logLevel),
    baileysLogLevel: String(raw.baileysLogLevel || DEFAULTS.baileysLogLevel),
    printQRInTerminalSetting: parseBoolean(raw.printQRInTerminal, DEFAULTS.printQRInTerminal),
    uiModeSetting,
    uiColor: parseBoolean(raw.uiColor, DEFAULTS.uiColor),
    uiMaxEvents: parseInteger(raw.uiMaxEvents, DEFAULTS.uiMaxEvents),
    authDir: path.resolve(process.cwd(), String(raw.authDir || DEFAULTS.authDir)),
    dbPath: path.resolve(process.cwd(), String(raw.dbPath || DEFAULTS.dbPath)),
    uiMode: hasArg("--ui") ? "dashboard" : uiModeSetting,
    async persist() {
      const payload = JSON.stringify(serializeConfig(config), null, 2);
      const directory = path.dirname(config.configPath);
      const tempPath = `${config.configPath}.tmp`;
      await fs.promises.mkdir(directory, { recursive: true });
      await fs.promises.writeFile(tempPath, payload, "utf8");
      await fs.promises.rename(tempPath, config.configPath);
      return config;
    },
    async addOwnerNumber(value) {
      const phoneNumber = normalizePhoneNumber(value);
      if (!phoneNumber) {
        throw new Error("Nomor owner tidak valid");
      }

      if (config.ownerNumbers.includes(phoneNumber)) {
        return {
          added: false,
          phoneNumber,
          ownerNumbers: [...config.ownerNumbers]
        };
      }

      config.ownerNumbers = [...config.ownerNumbers, phoneNumber];
      await config.persist();
      return {
        added: true,
        phoneNumber,
        ownerNumbers: [...config.ownerNumbers]
      };
    }
  };

  config.printQRInTerminal = config.uiMode === "dashboard" ? false : config.printQRInTerminalSetting;
  return config;
};

const loadConfig = (configPath = DEFAULT_CONFIG_PATH) => createRuntimeConfig(readConfigFile(configPath), {
  configPath
});

const config = loadConfig();

module.exports = config;
module.exports.DEFAULT_CONFIG_PATH = DEFAULT_CONFIG_PATH;
module.exports.DEFAULTS = DEFAULTS;
module.exports.loadConfig = loadConfig;
module.exports.createRuntimeConfig = createRuntimeConfig;
