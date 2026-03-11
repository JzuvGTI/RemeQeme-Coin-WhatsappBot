const https = require("node:https");
const {
  default: defaultMakeWASocket,
  makeWASocket: namedMakeWASocket,
  useMultiFileAuthState,
  Browsers,
  DisconnectReason
} = require("@hamxyztmvn/baileys-pro");

const config = require("./config");
const { createLogger, createPlainConsoleTransport } = require("./logger");
const { JsonDatabase } = require("./core/json-db");
const { createCommandRouter } = require("./core/command-router");
const { commandMap } = require("./commands");
const {
  createDashboardTransport,
  createTerminalDashboard
} = require("./ui/terminal-dashboard");

const makeWASocket = defaultMakeWASocket || namedMakeWASocket;
const DEFAULT_WA_VERSION = [2, 3000, 1029030078];
const WA_WEB_SW_URL = "https://web.whatsapp.com/sw.js";
const CLIENT_REVISION_REGEX = /client_revision[^0-9]*(\d+)/i;
const WA_VERSION_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedWaVersionInfo = null;

const dashboard =
  config.uiMode === "dashboard"
    ? createTerminalDashboard({
        botName: config.botName,
        ownerNumbers: config.ownerNumbers,
        prefixes: config.prefixes,
        color: config.uiColor,
        maxEvents: config.uiMaxEvents
      })
    : null;

const uiActive = Boolean(dashboard?.start());
const appTransport = uiActive
  ? createDashboardTransport(dashboard)
  : createPlainConsoleTransport();

const logger = createLogger(config.logLevel, {}, { transport: appTransport });
const baileysLogger = createLogger(
  config.baileysLogLevel,
  { module: "baileys" },
  { transport: appTransport }
);
const db = new JsonDatabase(config.dbPath, logger);

const getDisconnectCode = (lastDisconnect = {}) => {
  const error = lastDisconnect.error || {};
  return error?.output?.statusCode || error?.statusCode;
};

const getDisconnectReason = (code) => {
  if (typeof code !== "number") {
    return "unknown";
  }

  if (code === 405) {
    return "serverRejected405";
  }

  return DisconnectReason[code] || "unknown";
};

const isRecoverableDisconnect = (code) => {
  switch (code) {
    case 405:
    case DisconnectReason.loggedOut:
    case DisconnectReason.connectionReplaced:
    case DisconnectReason.badSession:
    case DisconnectReason.multideviceMismatch:
    case DisconnectReason.forbidden:
      return false;
    default:
      return true;
  }
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const selectBrowserProfile = () => {
  switch (process.platform) {
    case "win32":
      return Browsers.windows("Chrome");
    case "darwin":
      return Browsers.macOS("Chrome");
    default:
      return Browsers.ubuntu("Chrome");
  }
};

const fetchText = (url, headers) =>
  new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "GET",
        headers
      },
      (response) => {
        let body = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode !== 200) {
            reject(
              new Error(
                `HTTP ${response.statusCode} ${response.statusMessage || ""}`.trim()
              )
            );
            return;
          }

          resolve(body);
        });
      }
    );

    request.on("error", reject);
    request.end();
  });

const fetchLatestWaVersionInfo = async () => {
  const now = Date.now();
  if (
    cachedWaVersionInfo &&
    now - cachedWaVersionInfo.fetchedAt < WA_VERSION_CACHE_TTL_MS
  ) {
    return cachedWaVersionInfo;
  }

  try {
    const serviceWorker = await fetchText(WA_WEB_SW_URL, {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://web.whatsapp.com/",
      "Sec-Fetch-Dest": "serviceworker",
      "Sec-Fetch-Mode": "same-origin",
      "Sec-Fetch-Site": "same-origin",
      "Service-Worker": "script"
    });
    const match = serviceWorker.match(CLIENT_REVISION_REGEX);

    if (!match?.[1]) {
      throw new Error("client_revision not found in sw.js");
    }

    const version = [2, 3000, Number(match[1])];
    cachedWaVersionInfo = {
      version,
      source: "live-sw.js",
      fetchedAt: now
    };
    return cachedWaVersionInfo;
  } catch (error) {
    cachedWaVersionInfo = {
      version: DEFAULT_WA_VERSION,
      source: "fallback-default",
      fetchedAt: now,
      errorMessage: error?.message || "unknown error"
    };
    return cachedWaVersionInfo;
  }
};

const startBot = async () => {
  await db.init();

  const sweepPvpRooms = async (reason) => {
    try {
      const settlements = await db.sweepExpiredPvpRooms();
      if (settlements.length) {
        logger.info({
          event: "pvp.sweep.settled",
          reason,
          count: settlements.length
        }, "PVP_SWEEP_SETTLED");
      }
    } catch (error) {
      logger.error({
        event: "pvp.sweep.failed",
        reason,
        message: error?.message
      }, "PVP_SWEEP_FAILED");
    }
  };

  await sweepPvpRooms("startup");
  const pvpSweepInterval = setInterval(() => {
    sweepPvpRooms("interval");
  }, 5000);

  if (typeof pvpSweepInterval.unref === "function") {
    pvpSweepInterval.unref();
  }

  logger.info({
    event: "bot.bootstrap",
    botName: config.botName,
    prefixes: config.prefixes,
    ownerNumbers: config.ownerNumbers,
    baileysLogLevel: config.baileysLogLevel
  }, "BOT_BOOTSTRAP");

  let reconnectPending = false;

  const connect = async () => {
    const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
    const browser = selectBrowserProfile();
    const waVersionInfo = await fetchLatestWaVersionInfo();

    if (waVersionInfo.source === "live-sw.js") {
      logger.info({
        event: "connection.profile",
        browser,
        version: waVersionInfo.version,
        versionSource: waVersionInfo.source
      }, "WA_PROFILE");
    } else {
      logger.warn({
        event: "connection.profile_fallback",
        browser,
        version: waVersionInfo.version,
        versionSource: waVersionInfo.source,
        reason: waVersionInfo.errorMessage
      }, "WA_PROFILE_FALLBACK");
    }

    const sock = makeWASocket({
      auth: state,
      logger: baileysLogger,
      browser,
      version: waVersionInfo.version,
      printQRInTerminal: config.printQRInTerminal
    });

    const routeCommand = createCommandRouter({
      sock,
      db,
      config,
      logger,
      commandMap
    });

    sock.ev.on("creds.update", async () => {
      try {
        await saveCreds();
        logger.debug({ event: "auth.creds_saved" }, "AUTH_CREDS_SAVED");
      } catch (error) {
        logger.error({
          event: "auth.creds_save_failed",
          reason: error?.message
        }, "AUTH_CREDS_SAVE_FAILED");
      }
    });

    sock.ev.on("messages.upsert", async ({ messages = [] }) => {
      for (const msg of messages) {
        await routeCommand(msg);
      }
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, qr, isNewLogin, lastDisconnect } = update || {};

      if (qr) {
        dashboard?.setQr(qr);
        logger.debug({
          event: "connection.qr_ready",
          isNewLogin: Boolean(isNewLogin)
        }, "WA_QR_READY");
      }

      if (connection === "connecting") {
        logger.debug({
          event: "connection.connecting",
          isNewLogin: Boolean(isNewLogin)
        }, "WA_CONNECTING");
      }

      if (connection === "open") {
        reconnectPending = false;
        dashboard?.clearQr();
        logger.info({ event: "connection.opened" }, "WA_CONNECTED");
        return;
      }

      if (connection !== "close") {
        return;
      }

      const code = getDisconnectCode(lastDisconnect);
      const disconnectReason = getDisconnectReason(code);
      const shouldReconnect = isRecoverableDisconnect(code);
      const disconnectMessage = lastDisconnect?.error?.message;

      if (!shouldReconnect) {
        reconnectPending = false;
        dashboard?.clearQr();
      }

      logger.warn({
        event: "connection.closed",
        disconnectCode: code,
        disconnectReason,
        disconnectMessage,
        shouldReconnect
      }, "WA_CLOSED");

      if (!shouldReconnect) {
        const message =
          code === 405
            ? "Server WhatsApp menolak sesi login (405). Logout semua linked devices di HP, pastikan tidak ada instance lain yang aktif, lalu pairing ulang."
            : code === DisconnectReason.connectionReplaced
            ? "Session digantikan koneksi lain. Hentikan instance/device lain yang memakai sesi ini, lalu pairing ulang bila perlu."
            : "Session tidak bisa dipulihkan otomatis. Pairing ulang diperlukan.";

        logger.error({
          event: "connection.logged_out",
          disconnectCode: code,
          disconnectReason,
          message
        }, "WA_LOGGED_OUT");
        return;
      }

      if (reconnectPending) {
        return;
      }

      reconnectPending = true;
      await delay(5000);
      reconnectPending = false;
      logger.debug({ event: "connection.reconnect_attempt" }, "WA_RECONNECTING");
      connect().catch((error) => {
        logger.error({
          event: "connection.reconnect_failed",
          reason: error?.message
        }, "WA_RECONNECT_FAILED");
      });
    });
  };

  await connect();
};

startBot().catch((error) => {
  logger.error({
    event: "bot.fatal_error",
    reason: error?.message,
    stack: error?.stack
  }, "BOT_FATAL_ERROR");
  dashboard?.stop();
  process.exitCode = 1;
});
