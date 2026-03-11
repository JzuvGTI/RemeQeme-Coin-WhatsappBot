const test = require("node:test");
const assert = require("node:assert/strict");

const { createTerminalDashboard, stripAnsi } = require("../src/ui/terminal-dashboard");

const createStdoutStub = () => ({
  isTTY: true,
  columns: 120,
  write() {},
  on() {},
  off() {}
});

test("dashboard merangkum event command dan connection secara compact", () => {
  const dashboard = createTerminalDashboard({
    botName: "PVP DUEL BOT",
    ownerNumbers: ["6285956640569"],
    prefixes: ["/", ".", "!"],
    color: false,
    maxEvents: 6,
    now: () => new Date("2026-03-09T03:12:46.000Z").getTime(),
    stdout: createStdoutStub()
  });

  dashboard.handleRecord({
    ts: "2026-03-09T03:12:46.729Z",
    level: "info",
    message: "BOT_BOOTSTRAP",
    data: {
      event: "bot.bootstrap",
      botName: "PVP DUEL BOT",
      ownerNumbers: ["6285956640569"],
      prefixes: ["/", ".", "!"]
    }
  });

  dashboard.handleRecord({
    ts: "2026-03-09T03:12:48.102Z",
    level: "info",
    message: "WA_CONNECTED",
    data: {
      event: "connection.opened"
    }
  });

  dashboard.handleRecord({
    ts: "2026-03-09T03:12:51.596Z",
    level: "info",
    message: "CMD_RECEIVED .help",
    data: {
      event: "command.received",
      commandWithPrefix: ".help",
      senderName: "ExJZV B/S BLACK | WLMART",
      senderNumber: "6285956640569",
      chatType: "group",
      groupName: "Byone Group"
    }
  });

  dashboard.handleRecord({
    ts: "2026-03-09T03:12:52.225Z",
    level: "info",
    message: "BOT_REPLY .help",
    data: {
      event: "command.reply",
      status: "reply",
      commandWithPrefix: ".help",
      replyText: "*PVP DUEL BOT* daftar command..."
    }
  });

  dashboard.handleRecord({
    ts: "2026-03-09T03:12:52.238Z",
    level: "info",
    message: "CMD_SUCCESS .help",
    data: {
      event: "command.success",
      commandWithPrefix: ".help"
    }
  });

  const snapshot = dashboard.getSnapshot();
  const output = stripAnsi(dashboard.renderToString());

  assert.equal(snapshot.counters.commands, 1);
  assert.equal(snapshot.counters.replies, 1);
  assert.equal(snapshot.counters.success, 1);
  assert.equal(snapshot.connection.status, "CONNECTED");
  assert.match(output, /PVP DUEL BOT/i);
  assert.match(output, /Recent Activity/);
  assert.match(output, /\.help/);
  assert.match(output, /\[OUT\] 10:12:52 \.help/);
});

test("dashboard menggabungkan event berulang agar feed tidak banjir", () => {
  const dashboard = createTerminalDashboard({
    botName: "PVP DUEL BOT",
    ownerNumbers: ["6285956640569"],
    prefixes: ["/", ".", "!"],
    color: false,
    maxEvents: 4,
    stdout: createStdoutStub()
  });

  const repeated = {
    level: "warn",
    message: "WA_CLOSED",
    data: {
      event: "connection.closed",
      disconnectCode: 440,
      shouldReconnect: true
    }
  };

  dashboard.handleRecord({ ...repeated, ts: "2026-03-09T03:13:43.296Z" });
  dashboard.handleRecord({ ...repeated, ts: "2026-03-09T03:13:55.737Z" });

  const snapshot = dashboard.getSnapshot();
  assert.equal(snapshot.counters.reconnects, 2);
  assert.equal(snapshot.recentEvents[0].count, 2);
  assert.equal(snapshot.recentEvents[0].tag, "WA");
});
