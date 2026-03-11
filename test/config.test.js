const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const { loadConfig } = require("../src/config");

const makeTempConfigPath = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pvp-duel-config-"));
  return path.join(dir, "settings.json");
};

test("loadConfig membaca settings JSON dan addOwnerNumber persist", async () => {
  const configPath = await makeTempConfigPath();
  await fs.writeFile(
    configPath,
    JSON.stringify(
      {
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
      },
      null,
      2
    ),
    "utf8"
  );

  const config = loadConfig(configPath);
  assert.equal(config.botName, "PVP DUEL BOT");
  assert.deepEqual(config.ownerNumbers, ["6285956640569"]);

  const result = await config.addOwnerNumber("628777777777");
  assert.equal(result.added, true);
  assert.deepEqual(config.ownerNumbers, ["6285956640569", "628777777777"]);

  const persisted = JSON.parse(await fs.readFile(configPath, "utf8"));
  assert.deepEqual(persisted.ownerNumbers, ["6285956640569", "628777777777"]);
});
