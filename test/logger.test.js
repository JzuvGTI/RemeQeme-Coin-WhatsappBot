const test = require("node:test");
const assert = require("node:assert/strict");

const { createLogger } = require("../src/logger");

test("createLogger mengirim record terstruktur ke transport", () => {
  const records = [];
  const logger = createLogger(
    "info",
    { service: "bot" },
    {
      transport: {
        write(record) {
          records.push(record);
        }
      }
    }
  );

  logger.info({ event: "bot.bootstrap", botName: "Byone" }, "BOOT");

  assert.equal(records.length, 1);
  assert.equal(records[0].level, "info");
  assert.equal(records[0].message, "BOOT");
  assert.equal(records[0].data.service, "bot");
  assert.equal(records[0].data.event, "bot.bootstrap");
  assert.equal(records[0].data.botName, "Byone");
});

test("child logger mewarisi transport dan menambah binding", () => {
  const records = [];
  const root = createLogger(
    "debug",
    { app: "byone" },
    {
      transport: {
        write(record) {
          records.push(record);
        }
      }
    }
  );

  const child = root.child({ module: "router" });
  child.warn({ event: "command.unknown", commandWithPrefix: ".abc" }, "WARN_TEST");

  assert.equal(records.length, 1);
  assert.equal(records[0].level, "warn");
  assert.equal(records[0].data.app, "byone");
  assert.equal(records[0].data.module, "router");
  assert.equal(records[0].data.commandWithPrefix, ".abc");
});
