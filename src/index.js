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

    const sock = makeWASocket({
      auth: state,
      logger: baileysLogger,
      browser: Browsers.ubuntu("Chrome"),
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
