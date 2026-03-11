const test = require("node:test");
const assert = require("node:assert/strict");

const { parseCommand } = require("../src/utils/message");

test("parseCommand mendukung prefix / . !", () => {
  assert.deepEqual(parseCommand("/help", ["/", ".", "!"])?.command, "help");
  assert.deepEqual(parseCommand(".menu", ["/", ".", "!"])?.command, "menu");
  assert.deepEqual(parseCommand("!regis 1 byone", ["/", ".", "!"])?.command, "regis");
});

test("parseCommand case-insensitive untuk command name", () => {
  const parsed = parseCommand("/InFoGrOuP", ["/", ".", "!"]);
  assert.equal(parsed.command, "infogroup");
});

test("parseCommand /regis memecah argumen sesuai format", () => {
  const parsed = parseCommand("/regis 123456 Nama Panjang User", ["/", ".", "!"]);
  assert.equal(parsed.command, "regis");
  assert.equal(parsed.args[0], "123456");
  assert.deepEqual(parsed.args.slice(1), ["Nama", "Panjang", "User"]);
});

test("parseCommand mengembalikan null bila bukan command", () => {
  assert.equal(parseCommand("halo bot", ["/", ".", "!"]), null);
});
