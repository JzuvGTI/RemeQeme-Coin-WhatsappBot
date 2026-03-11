const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const { JsonDatabase } = require("../src/core/json-db");

const logger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};

const makeTempPath = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pvp-duel-db-"));
  return {
    dir,
    file: path.join(dir, "database.json")
  };
};

test("JsonDatabase registerUser membuat player profile baru", async () => {
  const temp = await makeTempPath();
  const db = new JsonDatabase(temp.file, logger);
  await db.init();

  const result = await db.registerUser("62811111", "Alpha Player");

  assert.equal(result.created, true);
  assert.equal(result.user.primaryId, 1);
  assert.equal(result.user.phoneNumber, "62811111");
  assert.equal(result.user.displayName, "Alpha Player");
  assert.equal(result.user.coins, 0);
  assert.equal(result.user.inventory.champ, 0);
  assert.equal(result.user.effects.champNextSpin, false);
  assert.equal(result.user.isRegistered, true);
});

test("registerUser idempotent dan addCoinsToUser by UserID berjalan", async () => {
  const temp = await makeTempPath();
  const db = new JsonDatabase(temp.file, logger);
  await db.init();

  const first = await db.registerUser("62811111", "Alpha Player");
  await db.addCoinsToUser(first.user.primaryId, 150, "6285956640569");
  const second = await db.registerUser("62811111", "Alpha Player");

  assert.equal(second.created, false);
  assert.equal(second.user.primaryId, first.user.primaryId);
  assert.equal(second.user.coins, 150);
});

test("removeCoinsFromUser menolak saldo kurang dan tidak pernah minus", async () => {
  const temp = await makeTempPath();
  const db = new JsonDatabase(temp.file, logger);
  await db.init();

  const created = await db.registerUser("62899999", "Target");
  await db.addCoinsToUser(created.user.phoneNumber, 1500, "owner");
  const updated = await db.removeCoinsFromUser(created.user.primaryId, 1000, "owner");

  assert.equal(updated.coins, 500);

  await assert.rejects(
    () => db.removeCoinsFromUser(created.user.primaryId, 1000, "owner"),
    /Coin target tidak cukup/
  );
  assert.equal(db.getUserByPhone(created.user.phoneNumber).coins, 500);
});

test("JsonDatabase serial write queue menghindari race write", async () => {
  const temp = await makeTempPath();
  const db = new JsonDatabase(temp.file, logger);
  await db.init();

  await Promise.all([
    db.registerUser("62811111", "A"),
    db.registerUser("62822222", "B"),
    db.registerUser("62833333", "C")
  ]);

  const raw = await fs.readFile(temp.file, "utf8");
  const parsed = JSON.parse(raw);
  assert.equal(Object.keys(parsed.registrations).length, 3);
  assert.equal(Object.keys(parsed.indexes.primaryIdToPhone).length, 3);
  assert.deepEqual(Object.keys(parsed.indexes.primaryIdToPhone), ["1", "2", "3"]);
});

test("JsonDatabase migrate legacy schema lama ke schema numeric baru", async () => {
  const temp = await makeTempPath();
  await fs.mkdir(path.dirname(temp.file), { recursive: true });
  await fs.writeFile(
    temp.file,
    JSON.stringify(
      {
        meta: {
          version: 2,
          updatedAt: "2026-03-09T03:17:17.536Z"
        },
        registrations: {
          "6282177368730": {
            primaryId: "PVP000001",
            phoneNumber: "6282177368730",
            name: "Piaaluv",
            coins: 15,
            updatedAt: "2026-03-09T03:17:17.536Z"
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const db = new JsonDatabase(temp.file, logger);
  await db.init();

  const user = db.getUserByPhone("6282177368730");
  assert.equal(user.primaryId, 1);
  assert.equal(user.phoneNumber, "6282177368730");
  assert.equal(user.displayName, "Piaaluv");
  assert.equal(user.coins, 15);
  assert.equal(user.isRegistered, true);
});

test("JsonDatabase recovery dari backup saat primary corrupt", async () => {
  const temp = await makeTempPath();
  const backup = `${temp.file}.bak`;

  await fs.mkdir(path.dirname(temp.file), { recursive: true });
  await fs.writeFile(temp.file, "{ this is corrupt json", "utf8");
  await fs.writeFile(
    backup,
    JSON.stringify(
      {
        meta: {
          version: 3,
          updatedAt: new Date().toISOString(),
          nextPrimaryId: 2
        },
        indexes: {
          primaryIdToPhone: {
            "1": "62899999"
          }
        },
        registrations: {
          "62899999": {
            primaryId: 1,
            phoneNumber: "62899999",
            displayName: "Backup User",
            coins: 99,
            isRegistered: true,
            inventory: { champ: 0 },
            effects: { champNextSpin: false },
            ban: { active: false, expiresAt: null, reason: "Unspecified Reason.", bannedBy: "", bannedAt: null },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const db = new JsonDatabase(temp.file, logger);
  await db.init();

  const user = db.getUserByPrimaryId(1);
  assert.equal(user.phoneNumber, "62899999");
  assert.equal(user.coins, 99);
});

test("transfer coin, buy champ, use champ, lalu spin menghabiskan boost 1x", async () => {
  const temp = await makeTempPath();
  const db = new JsonDatabase(temp.file, logger, { random: () => 0 });
  await db.init();

  const alpha = await db.registerUser("62811111", "Alpha");
  const beta = await db.registerUser("62822222", "Beta");
  await db.addCoinsToUser(alpha.user.phoneNumber, 1000, "owner");

  const transfer = await db.transferCoins(alpha.user.phoneNumber, beta.user.phoneNumber, 250, "Alpha");
  assert.equal(transfer.fromUser.coins, 750);
  assert.equal(transfer.toUser.coins, 250);

  await db.addCoinsToUser(beta.user.phoneNumber, 500, "owner");
  const buy = await db.buyItem(beta.user.phoneNumber, "champ", 1, 500);
  assert.equal(buy.user.coins, 250);
  assert.equal(buy.user.inventory.champ, 1);

  const afterUse = await db.useChamp(beta.user.phoneNumber);
  assert.equal(afterUse.inventory.champ, 0);
  assert.equal(afterUse.effects.champNextSpin, true);

  const spin = await db.spinWheel(beta.user.phoneNumber);
  assert.equal(spin.usedChampBoost, true);
  assert.equal(spin.result, 33);
  assert.equal(spin.user.effects.champNextSpin, false);
  assert.equal(db.getUserRank(beta.user.phoneNumber), 2);
});

test("PVP REME create, join, dan winner memakai ranking 0 tertinggi", async () => {
  const sequence = [0.76, 0.44];
  const db = new JsonDatabase((await makeTempPath()).file, logger, {
    random: () => sequence.shift() ?? 0
  });
  await db.init();

  const alpha = await db.registerUser("62811111", "Alpha");
  const beta = await db.registerUser("62822222", "Beta");
  await db.addCoinsToUser(alpha.user.phoneNumber, 2000, "owner");
  await db.addCoinsToUser(beta.user.phoneNumber, 2000, "owner");

  const created = await db.createPvpRoom({
    mode: "REME",
    roomCode: "R1",
    bet: 1000,
    chatId: "1203631@g.us",
    creatorPhoneNumber: alpha.user.phoneNumber,
    creatorDisplayName: "Alpha"
  });
  assert.equal(created.creatorUser.coins, 1000);
  assert.equal(created.room.status, "waiting");

  const joined = await db.joinPvpRoom({
    mode: "REME",
    roomCode: "R1",
    chatId: "1203631@g.us",
    joinerPhoneNumber: beta.user.phoneNumber,
    joinerDisplayName: "Beta"
  });
  assert.equal(joined.joinerUser.coins, 1000);
  assert.equal(joined.room.status, "active");
  assert.equal(joined.room.pot, 2000);

  const firstSpin = await db.spinPvpRound(alpha.user.phoneNumber, "Alpha");
  assert.equal(firstSpin.type, "waiting_opponent");
  assert.equal(firstSpin.spin.rawNumber, 28);
  assert.equal(firstSpin.spin.score, 0);

  const secondSpin = await db.spinPvpRound(beta.user.phoneNumber, "Beta");
  assert.equal(secondSpin.type, "win");
  assert.equal(secondSpin.winner.phoneNumber, alpha.user.phoneNumber);
  assert.equal(secondSpin.player1Spin.score, 0);
  assert.equal(secondSpin.player2Spin.score, 7);
  assert.equal(db.getUserByPhone(alpha.user.phoneNumber).coins, 3000);
  assert.equal(db.getUserByPhone(beta.user.phoneNumber).coins, 1000);
  assert.equal(db.getPvpRoom("R1"), null);
});

test("PVP REME tie mereset round dan deadline duel", async () => {
  const sequence = [0.52, 0.76];
  const db = new JsonDatabase((await makeTempPath()).file, logger, {
    random: () => sequence.shift() ?? 0
  });
  await db.init();

  const alpha = await db.registerUser("62811111", "Alpha");
  const beta = await db.registerUser("62822222", "Beta");
  await db.addCoinsToUser(alpha.user.phoneNumber, 2000, "owner");
  await db.addCoinsToUser(beta.user.phoneNumber, 2000, "owner");

  await db.createPvpRoom({
    mode: "REME",
    roomCode: "R2",
    bet: 1000,
    chatId: "1203631@g.us",
    creatorPhoneNumber: alpha.user.phoneNumber,
    creatorDisplayName: "Alpha"
  });
  const joined = await db.joinPvpRoom({
    mode: "REME",
    roomCode: "R2",
    chatId: "1203631@g.us",
    joinerPhoneNumber: beta.user.phoneNumber,
    joinerDisplayName: "Beta"
  });
  const firstDeadline = joined.room.duelExpiresAt;

  await db.spinPvpRound(alpha.user.phoneNumber, "Alpha");
  const tie = await db.spinPvpRound(beta.user.phoneNumber, "Beta");

  assert.equal(tie.type, "tie");
  assert.equal(tie.previousRound.player1.score, 0);
  assert.equal(tie.previousRound.player2.score, 0);
  assert.equal(tie.room.round, 2);
  assert.equal(tie.room.player1.spin, null);
  assert.equal(tie.room.player2.spin, null);
  assert.notEqual(tie.room.duelExpiresAt, firstDeadline);
});

test("PVP QEME memakai 10 20 30 sebagai nilai tertinggi dan 0 setara 1", async () => {
  const sequence = [0.3, 0.28];
  const db = new JsonDatabase((await makeTempPath()).file, logger, {
    random: () => sequence.shift() ?? 0
  });
  await db.init();

  const alpha = await db.registerUser("62811111", "Alpha");
  const beta = await db.registerUser("62822222", "Beta");
  await db.addCoinsToUser(alpha.user.phoneNumber, 2000, "owner");
  await db.addCoinsToUser(beta.user.phoneNumber, 2000, "owner");

  await db.createPvpRoom({
    mode: "QEME",
    roomCode: "Q1",
    bet: 1000,
    chatId: "1203631@g.us",
    creatorPhoneNumber: alpha.user.phoneNumber,
    creatorDisplayName: "Alpha"
  });
  await db.joinPvpRoom({
    mode: "QEME",
    roomCode: "Q1",
    chatId: "1203631@g.us",
    joinerPhoneNumber: beta.user.phoneNumber,
    joinerDisplayName: "Beta"
  });

  const firstSpin = await db.spinPvpRound(alpha.user.phoneNumber, "Alpha");
  assert.equal(firstSpin.type, "waiting_opponent");
  assert.equal(firstSpin.spin.rawNumber, 11);
  assert.equal(firstSpin.spin.score, 1);
  assert.equal(firstSpin.spin.rank, 1);

  const secondSpin = await db.spinPvpRound(beta.user.phoneNumber, "Beta");
  assert.equal(secondSpin.type, "win");
  assert.equal(secondSpin.player2Spin.rawNumber, 10);
  assert.equal(secondSpin.player2Spin.score, 10);
  assert.equal(secondSpin.player2Spin.rank, 10);
  assert.equal(secondSpin.winner.phoneNumber, beta.user.phoneNumber);
  assert.equal(db.getUserByPhone(beta.user.phoneNumber).coins, 3000);
});

test("PVP QEME tie saat 0 melawan 1", async () => {
  const sequence = [0, 0.03];
  const db = new JsonDatabase((await makeTempPath()).file, logger, {
    random: () => sequence.shift() ?? 0
  });
  await db.init();

  const alpha = await db.registerUser("62811111", "Alpha");
  const beta = await db.registerUser("62822222", "Beta");
  await db.addCoinsToUser(alpha.user.phoneNumber, 2000, "owner");
  await db.addCoinsToUser(beta.user.phoneNumber, 2000, "owner");

  await db.createPvpRoom({
    mode: "QEME",
    roomCode: "Q2",
    bet: 1000,
    chatId: "1203631@g.us",
    creatorPhoneNumber: alpha.user.phoneNumber,
    creatorDisplayName: "Alpha"
  });
  const joined = await db.joinPvpRoom({
    mode: "QEME",
    roomCode: "Q2",
    chatId: "1203631@g.us",
    joinerPhoneNumber: beta.user.phoneNumber,
    joinerDisplayName: "Beta"
  });
  const firstDeadline = joined.room.duelExpiresAt;

  await db.spinPvpRound(alpha.user.phoneNumber, "Alpha");
  const tie = await db.spinPvpRound(beta.user.phoneNumber, "Beta");

  assert.equal(tie.type, "tie");
  assert.equal(tie.previousRound.player1.rawNumber, 0);
  assert.equal(tie.previousRound.player1.score, 1);
  assert.equal(tie.previousRound.player2.rawNumber, 1);
  assert.equal(tie.previousRound.player2.score, 1);
  assert.equal(tie.room.mode, "QEME");
  assert.notEqual(tie.room.duelExpiresAt, firstDeadline);
});

test("getWaitingPvpRooms hanya mengembalikan room waiting", async () => {
  const db = new JsonDatabase((await makeTempPath()).file, logger);
  await db.init();

  const alpha = await db.registerUser("62811111", "Alpha");
  const beta = await db.registerUser("62822222", "Beta");
  const gamma = await db.registerUser("62833333", "Gamma");
  await db.addCoinsToUser(alpha.user.phoneNumber, 3000, "owner");
  await db.addCoinsToUser(beta.user.phoneNumber, 3000, "owner");
  await db.addCoinsToUser(gamma.user.phoneNumber, 3000, "owner");

  await db.createPvpRoom({
    mode: "REME",
    roomCode: "R5",
    bet: 1000,
    chatId: "1203631@g.us",
    creatorPhoneNumber: alpha.user.phoneNumber,
    creatorDisplayName: "Alpha"
  });

  await db.createPvpRoom({
    mode: "REME",
    roomCode: "R6",
    bet: 1000,
    chatId: "1203631@g.us",
    creatorPhoneNumber: beta.user.phoneNumber,
    creatorDisplayName: "Beta"
  });

  await db.joinPvpRoom({
    mode: "REME",
    roomCode: "R6",
    chatId: "1203631@g.us",
    joinerPhoneNumber: gamma.user.phoneNumber,
    joinerDisplayName: "Gamma"
  });

  const rooms = db.getWaitingPvpRooms();
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].roomCode, "R5");
  assert.equal(rooms[0].status, "waiting");
});

test("PVP waiting timeout refund kembali setelah reload dan sweep", async () => {
  const temp = await makeTempPath();
  const db = new JsonDatabase(temp.file, logger);
  await db.init();

  const alpha = await db.registerUser("62811111", "Alpha");
  await db.addCoinsToUser(alpha.user.phoneNumber, 2000, "owner");
  await db.createPvpRoom({
    mode: "REME",
    roomCode: "R3",
    bet: 1000,
    chatId: "1203631@g.us",
    creatorPhoneNumber: alpha.user.phoneNumber,
    creatorDisplayName: "Alpha"
  });

  const snapshot = db.getSnapshot();
  snapshot.pvp.rooms.R3.waitingExpiresAt = "2020-01-01T00:00:00.000Z";
  await fs.writeFile(temp.file, JSON.stringify(snapshot, null, 2), "utf8");

  const reloaded = new JsonDatabase(temp.file, logger);
  await reloaded.init();
  const settlements = await reloaded.sweepExpiredPvpRooms();

  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].reason, "waiting_timeout");
  assert.equal(reloaded.getUserByPhone(alpha.user.phoneNumber).coins, 2000);
  assert.equal(reloaded.getPvpRoom("R3"), null);
});

test("ban temporary auto-expire saat syncUserState dipanggil", async () => {
  const temp = await makeTempPath();
  const db = new JsonDatabase(temp.file, logger);
  await db.init();

  const user = await db.registerUser("62877777", "Gamma");
  const snapshot = db.getSnapshot();
  snapshot.registrations[user.user.phoneNumber].ban = {
    active: true,
    expiresAt: "2020-01-01T00:00:00.000Z",
    reason: "Expired",
    bannedBy: "owner",
    bannedAt: "2020-01-01T00:00:00.000Z"
  };

  await fs.writeFile(temp.file, JSON.stringify(snapshot, null, 2), "utf8");

  const reloaded = new JsonDatabase(temp.file, logger);
  await reloaded.init();
  const state = await reloaded.syncUserState(user.user.phoneNumber, "Gamma");

  assert.equal(state.isBanned, false);
  assert.equal(state.user.ban.active, false);
});
