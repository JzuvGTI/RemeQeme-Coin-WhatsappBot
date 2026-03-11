const test = require("node:test");
const assert = require("node:assert/strict");

const { parseCoinAmount } = require("../src/utils/coin-amount");

test("parseCoinAmount menerima angka biasa dan shorthand k/m", () => {
  assert.equal(parseCoinAmount("100"), 100);
  assert.equal(parseCoinAmount("100k"), 100000);
  assert.equal(parseCoinAmount("1.5k"), 1500);
  assert.equal(parseCoinAmount("2m"), 2000000);
  assert.equal(parseCoinAmount("2.25m"), 2250000);
  assert.equal(parseCoinAmount("100K"), 100000);
  assert.equal(parseCoinAmount("2M"), 2000000);
});

test("parseCoinAmount menolak format yang rawan salah parse", () => {
  for (const value of ["0", "-1", "abc", "1.2345k", "1..5k", "100km", "1e3", "100 k"]) {
    assert.throws(() => parseCoinAmount(value), /Jumlah coin/i);
  }
});
