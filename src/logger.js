const LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: 70
};

const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;

const normalizeLevel = (level) => {
  const value = String(level || "info").toLowerCase();
  return Object.prototype.hasOwnProperty.call(LEVELS, value) ? value : "info";
};

const stripAnsi = (value) => String(value || "").replace(ANSI_PATTERN, "");

const truncate = (value, max = 140) => {
  const stringValue = String(value || "");
  if (stringValue.length <= max) {
    return stringValue;
  }

  return `${stringValue.slice(0, max - 3)}...`;
};

const formatValue = (value) => {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return truncate(value, 160);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => formatValue(item)).filter(Boolean).join(", ")}]`;
  }

  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  if (typeof value === "object") {
    return truncate(JSON.stringify(value), 200);
  }

  return truncate(String(value), 160);
};

const createPalette = (enabled = process.stdout.isTTY !== false) => {
  if (!enabled) {
    return {
      gray: (text) => text,
      cyan: (text) => text,
      blue: (text) => text,
      green: (text) => text,
      yellow: (text) => text,
      red: (text) => text,
      magenta: (text) => text,
      bold: (text) => text,
      badge: (_tone, text) => `[${text}]`
    };
  }

  const wrap = (open) => (text) => `${open}${text}\x1b[0m`;
  const toneMap = {
    info: "\x1b[30;46m",
    success: "\x1b[30;42m",
    warn: "\x1b[30;43m",
    error: "\x1b[37;41m",
    debug: "\x1b[30;47m",
    neutral: "\x1b[30;47m"
  };

  return {
    gray: wrap("\x1b[90m"),
    cyan: wrap("\x1b[36m"),
    blue: wrap("\x1b[34m"),
    green: wrap("\x1b[32m"),
    yellow: wrap("\x1b[33m"),
    red: wrap("\x1b[31m"),
    magenta: wrap("\x1b[35m"),
    bold: wrap("\x1b[1m"),
    badge: (tone, text) => `${toneMap[tone] || toneMap.neutral} ${text} \x1b[0m`
  };
};

const formatClock = (isoString) => {
  const date = isoString ? new Date(isoString) : new Date();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

const singleLine = (value, max = 72) =>
  truncate(String(value || "").replace(/\s+/g, " ").trim(), max);

const formatPlainFallback = (record) => {
  const details = record.data
    ? Object.entries(record.data)
        .filter(([, value]) => typeof value !== "undefined")
        .map(([key, value]) => `${key}=${formatValue(value)}`)
        .join(" | ")
    : "";

  const text = [record.message, details].filter(Boolean).join(" | ");
  return text || record.level.toUpperCase();
};

const buildPrettySummary = (record) => {
  const data = record.data || {};
  const event = data.event;
  const sender = singleLine(data.senderName || data.senderNumber || "-", 28);
  const senderNumber = data.senderNumber ? `(${data.senderNumber})` : "";
  const chat =
    data.chatType === "group"
      ? `@ ${singleLine(data.groupName || data.chatId || "group", 24)}`
      : "@ private";
  const command = data.commandWithPrefix || data.command || "-";
  const reason = singleLine(data.reason || data.message || "", 72);
  const replyPreview = singleLine(data.replyText || "", 76);

  switch (event) {
    case "bot.bootstrap":
      return {
        tone: "info",
        badge: "BOOT",
        text: `${data.botName || "Bot"} ready | prefix ${Array.isArray(data.prefixes) ? data.prefixes.join(" ") : "-"}`
      };
    case "connection.opened":
      return {
        tone: "success",
        badge: "WA",
        text: "Connected to WhatsApp"
      };
    case "connection.closed":
      return {
        tone: "warn",
        badge: "WA",
        text: `Disconnected | code=${data.disconnectCode || "?"} | reconnect=${data.shouldReconnect ? "yes" : "no"}`
      };
    case "connection.reconnect_attempt":
      return {
        tone: "warn",
        badge: "WA",
        text: "Reconnecting..."
      };
    case "connection.logged_out":
      return {
        tone: "error",
        badge: "WA",
        text: "Logged out | pairing ulang diperlukan"
      };
    case "connection.reconnect_failed":
      return {
        tone: "error",
        badge: "WA",
        text: `Reconnect failed | ${reason || "unknown error"}`
      };
    case "connection.qr_ready":
      return {
        tone: "warn",
        badge: "QR",
        text: "QR ready | scan di WhatsApp"
      };
    case "command.received":
      return {
        tone: "info",
        badge: "CMD",
        text: `${command} | ${sender} ${senderNumber} ${chat}`.replace(/\s+/g, " ").trim()
      };
    case "command.reply":
      return {
        tone: "success",
        badge: "OUT",
        text: `${command} | ${replyPreview || "reply terkirim"}`
      };
    case "command.success":
      return {
        tone: "success",
        badge: "OK",
        text: `${command} | selesai untuk ${sender} ${senderNumber}`.replace(/\s+/g, " ").trim()
      };
    case "command.unknown":
      return {
        tone: "warn",
        badge: "DENY",
        text: `${command} | command tidak dikenal`
      };
    case "command.denied.private_non_owner":
      return {
        tone: "warn",
        badge: "DENY",
        text: `${command} | private hanya owner`
      };
    case "command.denied.group_only":
      return {
        tone: "warn",
        badge: "DENY",
        text: `${command} | khusus group`
      };
    case "command.denied.admin_only":
      return {
        tone: "warn",
        badge: "DENY",
        text: `${command} | butuh admin group`
      };
    case "command.denied.owner_only":
      return {
        tone: "warn",
        badge: "DENY",
        text: `${command} | khusus owner bot`
      };
    case "command.denied.banned":
      return {
        tone: "warn",
        badge: "DENY",
        text: `${command} | user sedang diban`
      };
    case "command.group_metadata_error":
      return {
        tone: "error",
        badge: "ERR",
        text: `${command} | gagal baca metadata group`
      };
    case "command.unhandled_error":
      return {
        tone: "error",
        badge: "ERR",
        text: `${command} | ${reason || "runtime error"}`
      };
    case "auth.creds_save_failed":
      return {
        tone: "error",
        badge: "AUTH",
        text: `Gagal simpan session | ${reason || "unknown error"}`
      };
    case "bot.fatal_error":
      return {
        tone: "error",
        badge: "FATAL",
        text: reason || "Fatal error"
      };
    default:
      if (data.module === "baileys") {
        return {
          tone:
            record.level === "warn" ? "warn" : record.level === "error" || record.level === "fatal" ? "error" : "debug",
          badge: "WA",
          text: singleLine(record.message || formatPlainFallback(record), 100)
        };
      }

      return {
        tone:
          record.level === "warn" ? "warn" : record.level === "error" || record.level === "fatal" ? "error" : "debug",
        badge: record.level.toUpperCase().slice(0, 5),
        text: singleLine(formatPlainFallback(record), 110)
      };
  }
};

const formatPrettyRecord = (record, options = {}) => {
  const palette = options.palette || createPalette(options.color !== false);
  const summary = buildPrettySummary(record);
  const time = palette.gray(formatClock(record.ts));
  const badge = palette.badge(summary.tone, summary.badge.padEnd(5, " "));
  return `${time} ${badge} ${summary.text}`;
};

const createPlainConsoleTransport = (stream = console.log, options = {}) => {
  const palette = createPalette(options.color !== false);
  return {
    write(record) {
      stream(formatPrettyRecord(record, { palette, color: options.color }));
    }
  };
};

const createLogger = (level = "debug", bindings = {}, options = {}) => {
  let activeLevel = normalizeLevel(level);
  const transport = options.transport || createPlainConsoleTransport();

  const shouldLog = (targetLevel) => LEVELS[targetLevel] >= LEVELS[activeLevel];

  const write = (targetLevel, payload, message) => {
    if (!shouldLog(targetLevel)) {
      return;
    }

    let eventData;
    let finalMessage = message;

    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      eventData = { ...bindings, ...payload };
    } else {
      eventData = Object.keys(bindings).length ? { ...bindings } : undefined;
      if (typeof payload === "string" && !message) {
        finalMessage = payload;
      }
    }

    const record = {
      ts: new Date().toISOString(),
      level: targetLevel,
      message: finalMessage || "",
      data: eventData
    };

    transport.write(record);
  };

  return {
    get level() {
      return activeLevel;
    },
    set level(value) {
      activeLevel = normalizeLevel(value);
    },
    trace(payload, message) {
      write("trace", payload, message);
    },
    debug(payload, message) {
      write("debug", payload, message);
    },
    info(payload, message) {
      write("info", payload, message);
    },
    warn(payload, message) {
      write("warn", payload, message);
    },
    error(payload, message) {
      write("error", payload, message);
    },
    fatal(payload, message) {
      write("fatal", payload, message);
    },
    child(childBindings = {}) {
      return createLogger(activeLevel, { ...bindings, ...childBindings }, { transport });
    }
  };
};

module.exports = {
  LEVELS,
  normalizeLevel,
  formatPrettyRecord,
  createPlainConsoleTransport,
  createLogger
};
