const qrcode = require("qrcode-terminal");

const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const DEFAULT_MAX_EVENTS = 12;

const stripAnsi = (value) => String(value || "").replace(ANSI_PATTERN, "");

const visibleLength = (value) => stripAnsi(value).length;

const truncatePlain = (value, max) => {
  const input = String(value || "");
  if (max <= 0) {
    return "";
  }

  if (input.length <= max) {
    return input;
  }

  if (max === 1) {
    return "…";
  }

  return `${input.slice(0, max - 1)}…`;
};

const padAnsi = (value, width) => {
  const input = String(value || "");
  const padding = Math.max(0, width - visibleLength(input));
  return `${input}${" ".repeat(padding)}`;
};

const fitAnsi = (value, width) => {
  const input = String(value || "");
  if (visibleLength(input) <= width) {
    return padAnsi(input, width);
  }

  return padAnsi(truncatePlain(stripAnsi(input), width), width);
};

const formatClock = (isoString) => {
  const date = isoString ? new Date(isoString) : new Date();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

const formatUptime = (startedAt, now = Date.now()) => {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const remaining = String(seconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${remaining}`;
};

const createPalette = (enabled) => {
  if (!enabled) {
    return {
      bold: (text) => text,
      dim: (text) => text,
      cyan: (text) => text,
      green: (text) => text,
      yellow: (text) => text,
      red: (text) => text,
      magenta: (text) => text,
      blue: (text) => text,
      gray: (text) => text,
      inverse: (text) => text,
      badge: (_tone, text) => `[${text}]`
    };
  }

  const wrap = (open, close = "\x1b[0m") => (text) => `${open}${text}${close}`;

  const toneMap = {
    info: "\x1b[30;46m",
    success: "\x1b[30;42m",
    warn: "\x1b[30;43m",
    error: "\x1b[37;41m",
    neutral: "\x1b[30;47m"
  };

  return {
    bold: wrap("\x1b[1m"),
    dim: wrap("\x1b[2m"),
    cyan: wrap("\x1b[36m"),
    green: wrap("\x1b[32m"),
    yellow: wrap("\x1b[33m"),
    red: wrap("\x1b[31m"),
    magenta: wrap("\x1b[35m"),
    blue: wrap("\x1b[34m"),
    gray: wrap("\x1b[90m"),
    inverse: wrap("\x1b[7m"),
    badge: (tone, text) => `${toneMap[tone] || toneMap.neutral} ${text} \x1b[0m`
  };
};

const createDashboardTransport = (dashboard) => ({
  write(record) {
    dashboard.handleRecord(record);
  }
});

const buildEventSummary = (record, state) => {
  const event = record.data?.event;
  const command = record.data?.commandWithPrefix || record.data?.command || "";
  const sender = truncatePlain(record.data?.senderName || record.data?.senderNumber || "-", 22);
  const chatLabel =
    record.data?.chatType === "group"
      ? truncatePlain(record.data?.groupName || "group", 18)
      : "private";
  const replyPreview = truncatePlain(
    String(record.data?.replyText || "").replace(/\s+/g, " ").trim(),
    54
  );

  switch (event) {
    case "bot.bootstrap":
      return {
        tone: "info",
        tag: "SYS",
        text: `Booting ${record.data?.botName || "bot"}`
      };
    case "connection.qr_ready":
      return {
        tone: "warn",
        tag: "WA",
        text: "QR siap dipindai"
      };
    case "connection.opened":
      return {
        tone: "success",
        tag: "WA",
        text: "WhatsApp connected"
      };
    case "connection.closed":
      return {
        tone: "warn",
        tag: "WA",
        text: `Koneksi putus (code ${record.data?.disconnectCode || "?"})`
      };
    case "connection.reconnect_attempt":
      return {
        tone: "warn",
        tag: "WA",
        text: `Reconnect mencoba lagi #${state.counters.reconnects}`
      };
    case "connection.logged_out":
      return {
        tone: "error",
        tag: "WA",
        text: "Session logout, pairing ulang dibutuhkan"
      };
    case "connection.reconnect_failed":
      return {
        tone: "error",
        tag: "WA",
        text: `Reconnect gagal: ${truncatePlain(record.data?.reason || "unknown", 42)}`
      };
    case "command.received":
      return {
        tone: "info",
        tag: "CMD",
        text: `${command} • ${sender} • ${chatLabel}`
      };
    case "command.reply":
      if (record.data?.status !== "reply") {
        return null;
      }
      return {
        tone: "success",
        tag: "OUT",
        text: `${command} • ${replyPreview || "reply terkirim"}`
      };
    case "command.success":
      return null;
    case "command.unknown":
      return {
        tone: "warn",
        tag: "DENY",
        text: `${command} • command tidak dikenal`
      };
    case "command.denied.private_non_owner":
      return {
        tone: "warn",
        tag: "DENY",
        text: `${command} • private non-owner`
      };
    case "command.denied.group_only":
      return {
        tone: "warn",
        tag: "DENY",
        text: `${command} • hanya bisa di group`
      };
    case "command.denied.admin_only":
      return {
        tone: "warn",
        tag: "DENY",
        text: `${command} • butuh admin group`
      };
    case "command.group_metadata_error":
      return {
        tone: "error",
        tag: "ERR",
        text: `${command} • metadata group gagal`
      };
    case "command.unhandled_error":
      return {
        tone: "error",
        tag: "ERR",
        text: `${command || "unknown"} • ${truncatePlain(record.data?.reason || "unknown", 40)}`
      };
    case "auth.creds_save_failed":
      return {
        tone: "error",
        tag: "AUTH",
        text: `Gagal simpan session: ${truncatePlain(record.data?.reason || "unknown", 40)}`
      };
    case "bot.fatal_error":
      return {
        tone: "error",
        tag: "SYS",
        text: `Fatal: ${truncatePlain(record.data?.reason || "unknown", 46)}`
      };
    default:
      if (record.data?.module === "baileys") {
        return record.level === "warn" || record.level === "error" || record.level === "fatal"
          ? {
              tone: record.level === "warn" ? "warn" : "error",
              tag: "WA",
              text: truncatePlain(record.message || "Baileys event", 54)
            }
          : null;
      }

      if (record.level === "warn" || record.level === "error" || record.level === "fatal") {
        return {
          tone: record.level === "warn" ? "warn" : "error",
          tag: "LOG",
          text: truncatePlain(record.message || "Runtime event", 54)
        };
      }

      return null;
  }
};

const createTerminalDashboard = (options = {}) => {
  const stdout = options.stdout || process.stdout;
  const maxEvents = Number(options.maxEvents) > 0 ? Number(options.maxEvents) : DEFAULT_MAX_EVENTS;
  const colorEnabled = options.color !== false && stdout.isTTY !== false;
  const palette = createPalette(colorEnabled);
  const now = typeof options.now === "function" ? options.now : () => Date.now();

  const state = {
    startedAt: now(),
    bootedAt: null,
    botName: options.botName || "PVP DUEL BOT",
    ownerNumbers: Array.isArray(options.ownerNumbers) ? [...options.ownerNumbers] : [],
    prefixes: Array.isArray(options.prefixes) ? [...options.prefixes] : [],
    connection: {
      status: "BOOTING",
      reconnects: 0,
      disconnectCode: null,
      connectedAt: null
    },
    counters: {
      commands: 0,
      replies: 0,
      success: 0,
      denied: 0,
      errors: 0,
      reconnects: 0
    },
    recentEvents: [],
    qrText: "",
    lastError: "none"
  };

  let active = false;
  let intervalId = null;
  let signalBound = false;
  let stopping = false;

  const clearScreen = () => {
    stdout.write("\x1b[2J\x1b[H");
  };

  const hideCursor = () => {
    stdout.write("\x1b[?25l");
  };

  const showCursor = () => {
    stdout.write("\x1b[?25h");
  };

  const isSupported = () => stdout.isTTY !== false;

  const pushEvent = (entry, timestamp = new Date().toISOString()) => {
    if (!entry) {
      return;
    }

    const next = {
      at: timestamp,
      tone: entry.tone || "neutral",
      tag: entry.tag || "LOG",
      text: entry.text || "",
      signature: `${entry.tag || "LOG"}|${entry.text || ""}`,
      count: 1
    };

    const current = state.recentEvents[0];
    if (current && current.signature === next.signature) {
      current.at = next.at;
      current.count += 1;
      return;
    }

    state.recentEvents.unshift(next);
    state.recentEvents = state.recentEvents.slice(0, maxEvents);
  };

  const updateCounters = (record) => {
    switch (record.data?.event) {
      case "command.received":
        state.counters.commands += 1;
        break;
      case "command.reply":
        if (record.data?.status === "reply") {
          state.counters.replies += 1;
        }
        break;
      case "command.success":
        state.counters.success += 1;
        break;
      case "command.unknown":
      case "command.denied.private_non_owner":
      case "command.denied.group_only":
      case "command.denied.admin_only":
        state.counters.denied += 1;
        break;
      case "connection.closed":
        if (record.data?.shouldReconnect) {
          state.counters.reconnects += 1;
        }
        break;
      case "command.group_metadata_error":
      case "command.unhandled_error":
      case "connection.logged_out":
      case "connection.reconnect_failed":
      case "auth.creds_save_failed":
      case "bot.fatal_error":
        state.counters.errors += 1;
        break;
      default:
        break;
    }
  };

  const updateStatus = (record) => {
    switch (record.data?.event) {
      case "bot.bootstrap":
        state.bootedAt = record.ts;
        state.botName = record.data?.botName || state.botName;
        state.ownerNumbers = record.data?.ownerNumbers || state.ownerNumbers;
        state.prefixes = record.data?.prefixes || state.prefixes;
        state.connection.status = "BOOTING";
        break;
      case "connection.qr_ready":
        state.connection.status = "QR READY";
        break;
      case "connection.connecting":
        state.connection.status = "CONNECTING";
        break;
      case "connection.opened":
        state.connection.status = "CONNECTED";
        state.connection.connectedAt = record.ts;
        state.qrText = "";
        break;
      case "connection.closed":
        state.connection.status = "DISCONNECTED";
        state.connection.disconnectCode = record.data?.disconnectCode || null;
        state.connection.reconnects = state.counters.reconnects;
        break;
      case "connection.reconnect_attempt":
        state.connection.status = "RECONNECTING";
        state.connection.reconnects = state.counters.reconnects;
        break;
      case "connection.logged_out":
        state.connection.status = "LOGGED OUT";
        break;
      case "connection.reconnect_failed":
      case "command.group_metadata_error":
      case "command.unhandled_error":
      case "auth.creds_save_failed":
      case "bot.fatal_error":
        state.lastError = record.data?.reason || record.message || "unknown";
        break;
      default:
        break;
    }
  };

  const statusBadge = () => {
    const status = state.connection.status;
    if (status === "CONNECTED") {
      return palette.badge("success", status);
    }

    if (status === "RECONNECTING" || status === "CONNECTING" || status === "QR READY") {
      return palette.badge("warn", status);
    }

    if (status === "DISCONNECTED" || status === "LOGGED OUT") {
      return palette.badge("error", status);
    }

    return palette.badge("info", status);
  };

  const renderEventLine = (entry, width) => {
    const badge = palette.badge(entry.tone, entry.tag);
    const countSuffix = entry.count > 1 ? ` x${entry.count}` : "";
    const text = truncatePlain(`${formatClock(entry.at)} ${entry.text}${countSuffix}`, width - visibleLength(badge) - 1);
    return padAnsi(`${badge} ${text}`, width);
  };

  const renderStatLine = (width) => {
    const segments = [
      `${palette.cyan("CMD")} ${state.counters.commands}`,
      `${palette.green("OK")} ${state.counters.success}`,
      `${palette.blue("OUT")} ${state.counters.replies}`,
      `${palette.yellow("DENY")} ${state.counters.denied}`,
      `${palette.red("ERR")} ${state.counters.errors}`,
      `${palette.magenta("RE")} ${state.counters.reconnects}`
    ];

    return fitAnsi(segments.join("   "), width);
  };

  const panelHeader = (title, width) => fitAnsi(palette.bold(title), width);

  const panelLine = (label, value, width) => {
    const plainLabel = truncatePlain(label, Math.min(14, width));
    const prefix = palette.dim(`${plainLabel}:`);
    const content = truncatePlain(value, Math.max(0, width - visibleLength(prefix) - 1));
    return padAnsi(`${prefix} ${content}`, width);
  };

  const topBorder = (width, title) => {
    const cleanTitle = ` ${title} `;
    const visible = visibleLength(cleanTitle);
    const remaining = Math.max(0, width - 2 - visible);
    const left = Math.floor(remaining / 2);
    const right = remaining - left;
    return `┌${"─".repeat(left)}${cleanTitle}${"─".repeat(right)}┐`;
  };

  const middleBorder = (width) => `├${"─".repeat(width - 2)}┤`;
  const bottomBorder = (width) => `└${"─".repeat(width - 2)}┘`;

  const outerLine = (content, width) => `│${fitAnsi(content, width - 2)}│`;

  const renderTwoColumns = (width) => {
    const innerWidth = width - 2;
    const leftWidth = Math.max(48, Math.floor((innerWidth - 1) * 0.62));
    const rightWidth = innerWidth - leftWidth - 1;
    const maxRows = 14;

    const left = [panelHeader("Recent Activity", leftWidth)];
    const right = state.qrText
      ? [panelHeader("Pairing QR", rightWidth), ...state.qrText.split(/\r?\n/).filter(Boolean)]
      : [
          panelHeader("Session", rightWidth),
          panelLine("Status", stripAnsi(statusBadge()), rightWidth),
          panelLine("Uptime", formatUptime(state.startedAt, now()), rightWidth),
          panelLine("Reconnects", String(state.counters.reconnects), rightWidth),
          panelLine(
            "Disconnect",
            state.connection.disconnectCode ? String(state.connection.disconnectCode) : "-",
            rightWidth
          ),
          panelLine(
            "Connected",
            state.connection.connectedAt ? formatClock(state.connection.connectedAt) : "-",
            rightWidth
          ),
          panelLine("Owner", state.ownerNumbers[0] || "-", rightWidth),
          panelLine("Prefixes", state.prefixes.join(" "), rightWidth),
          panelLine("Last Error", truncatePlain(state.lastError || "none", 28), rightWidth),
          "",
          fitAnsi(palette.dim("Ctrl+C untuk keluar"), rightWidth),
          fitAnsi(palette.dim("npm start = plain logs"), rightWidth)
        ];

    const eventRows = Math.max(0, maxRows - left.length);
    const events = state.recentEvents.slice(0, eventRows);
    if (events.length === 0) {
      left.push(fitAnsi(palette.dim("Belum ada aktivitas."), leftWidth));
    } else {
      for (const event of events) {
        left.push(renderEventLine(event, leftWidth));
      }
    }

    while (left.length < maxRows) {
      left.push(" ".repeat(leftWidth));
    }

    while (right.length < maxRows) {
      right.push(" ".repeat(rightWidth));
    }

    const rows = [];
    for (let index = 0; index < maxRows; index += 1) {
      rows.push(`│${fitAnsi(left[index], leftWidth)}│${fitAnsi(right[index], rightWidth)}│`);
    }

    return rows;
  };

  const renderStacked = (width) => {
    const rows = [];
    const innerWidth = width - 2;
    rows.push(outerLine(panelHeader("Recent Activity", innerWidth), width));
    const events = state.recentEvents.slice(0, 8);
    if (events.length === 0) {
      rows.push(outerLine(palette.dim("Belum ada aktivitas."), width));
    } else {
      for (const event of events) {
        rows.push(outerLine(renderEventLine(event, innerWidth), width));
      }
    }
    rows.push(outerLine("", width));
    rows.push(outerLine(panelHeader("Session", innerWidth), width));
    rows.push(outerLine(panelLine("Status", stripAnsi(statusBadge()), innerWidth), width));
    rows.push(outerLine(panelLine("Uptime", formatUptime(state.startedAt, now()), innerWidth), width));
    rows.push(outerLine(panelLine("Reconnects", String(state.counters.reconnects), innerWidth), width));
    rows.push(outerLine(panelLine("Disconnect", state.connection.disconnectCode || "-", innerWidth), width));
    rows.push(outerLine(panelLine("Owner", state.ownerNumbers[0] || "-", innerWidth), width));
    if (state.qrText) {
      rows.push(outerLine("", width));
      rows.push(outerLine(panelHeader("Pairing QR", innerWidth), width));
      for (const line of state.qrText.split(/\r?\n/).filter(Boolean).slice(0, 12)) {
        rows.push(outerLine(fitAnsi(line, innerWidth), width));
      }
    }
    return rows;
  };

  const renderToString = () => {
    const width = Math.max(84, Math.min(stdout.columns || 120, 160));
    const lines = [];
    const title = `${palette.cyan(state.botName)} ${statusBadge()}`;

    lines.push(topBorder(width, title));
    lines.push(
      outerLine(
        `${palette.dim("Mode")} dashboard   ${palette.dim("Uptime")} ${formatUptime(state.startedAt, now())}   ${palette.dim("Owner")} ${truncatePlain(state.ownerNumbers[0] || "-", 18)}`,
        width
      )
    );
    lines.push(
      outerLine(
        `${palette.dim("Prefix")} ${state.prefixes.join(" ")}   ${palette.dim("Status")} ${stripAnsi(statusBadge())}`,
        width
      )
    );
    lines.push(middleBorder(width));
    lines.push(outerLine(renderStatLine(width - 2), width));
    lines.push(middleBorder(width));

    if (width >= 110) {
      lines.push(...renderTwoColumns(width));
    } else {
      lines.push(...renderStacked(width));
    }

    lines.push(middleBorder(width));
    lines.push(
      outerLine(
        `${palette.dim("Tips")} gunakan ${palette.bold(".menu")} untuk cek command, ${palette.bold("Ctrl+C")} untuk keluar.`,
        width
      )
    );
    lines.push(bottomBorder(width));

    return lines.join("\n");
  };

  const render = () => {
    if (!active) {
      return;
    }

    clearScreen();
    stdout.write(renderToString());
  };

  const cleanup = () => {
    if (stopping) {
      return;
    }

    stopping = true;

    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }

    if (signalBound && typeof stdout.off === "function") {
      stdout.off("resize", render);
    }

    showCursor();
    stdout.write("\x1b[0m");
    active = false;
  };

  const start = () => {
    if (active || !isSupported()) {
      return false;
    }

    active = true;
    hideCursor();
    clearScreen();

    if (!signalBound && typeof stdout.on === "function") {
      stdout.on("resize", render);
      signalBound = true;
    }

    process.once("exit", cleanup);
    process.once("SIGINT", () => {
      cleanup();
      process.exit(0);
    });
    process.once("SIGTERM", () => {
      cleanup();
      process.exit(0);
    });

    intervalId = setInterval(render, 1000);
    if (typeof intervalId.unref === "function") {
      intervalId.unref();
    }

    render();
    return true;
  };

  const stop = () => {
    cleanup();
    stdout.write("\n");
  };

  const setQr = (value) => {
    if (!value) {
      state.qrText = "";
      render();
      return;
    }

    qrcode.generate(value, { small: true }, (output) => {
      state.qrText = String(output || "").trimEnd();
      render();
    });
  };

  const clearQr = () => {
    state.qrText = "";
    render();
  };

  const handleRecord = (record) => {
    updateCounters(record);
    updateStatus(record);

    const summary = buildEventSummary(record, state);
    if (summary) {
      pushEvent(summary, record.ts);
    }

    render();
  };

  const getSnapshot = () =>
    JSON.parse(
      JSON.stringify({
        ...state,
        recentEvents: state.recentEvents.map((item) => ({
          at: item.at,
          tone: item.tone,
          tag: item.tag,
          text: item.text,
          count: item.count
        }))
      })
    );

  return {
    isSupported,
    start,
    stop,
    setQr,
    clearQr,
    handleRecord,
    render,
    renderToString,
    getSnapshot
  };
};

module.exports = {
  stripAnsi,
  truncatePlain,
  createDashboardTransport,
  createTerminalDashboard
};
