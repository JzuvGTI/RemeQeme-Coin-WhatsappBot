const fs = require("fs/promises");
const path = require("path");

const { normalizePhoneNumber } = require("../utils/jid");
const {
  PVP_MODE_REME,
  PVP_MODE_QEME,
  PVP_MIN_BET,
  PVP_WAIT_TIMEOUT_MS,
  PVP_DUEL_TIMEOUT_MS,
  normalizePvpMode,
  normalizeRoomCode,
  calculateRemeScore,
  getRemeRankValue,
  calculateQemeScore,
  getQemeRankValue
} = require("../utils/pvp");
const { rollRoulette } = require("../utils/roulette");
const { DEFAULT_REASON, isExpiredAt, normalizeReason } = require("../utils/time");

const DB_VERSION = 4;

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const clone = (value) => JSON.parse(JSON.stringify(value));

const toSafeInteger = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePrimaryId = (value) => {
  const parsed = toSafeInteger(value, NaN);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const normalizeLegacyPrimaryId = (value) => {
  const direct = normalizePrimaryId(value);
  if (direct) {
    return direct;
  }

  const raw = String(value || "").trim().toUpperCase();
  const match = raw.match(/^PVP0*(\d+)$/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const formatPrimaryId = (value) => {
  const primaryId = normalizePrimaryId(value);
  return primaryId ? String(primaryId) : "";
};

const normalizeDisplayName = (value, fallback = "UNKNOWN") => {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
};

const normalizeCount = (value, fallback = 0) => Math.max(0, toSafeInteger(value, fallback));

const createInventory = (existing = {}) => ({
  champ: normalizeCount(existing.champ, 0)
});

const createEffects = (existing = {}) => ({
  champNextSpin: existing.champNextSpin === true
});

const createBanState = (existing = {}) => ({
  active: existing.active === true,
  expiresAt: typeof existing.expiresAt === "string" && existing.expiresAt ? existing.expiresAt : null,
  reason: normalizeReason(existing.reason, DEFAULT_REASON),
  bannedBy: typeof existing.bannedBy === "string" ? existing.bannedBy : "",
  bannedAt: typeof existing.bannedAt === "string" ? existing.bannedAt : null
});

const createPvpStore = () => ({
  rooms: {},
  userToRoom: {}
});

const createPvpParticipant = (user = {}, displayName = user.displayName || user.phoneNumber || "") => ({
  phoneNumber: normalizePhoneNumber(user.phoneNumber || "") || "",
  primaryId: normalizePrimaryId(user.primaryId) || 0,
  displayName: normalizeDisplayName(displayName, user.phoneNumber || "UNKNOWN"),
  spin: null
});

const createPvpSpin = (rawNumber, mode = PVP_MODE_REME) => {
  const score = mode === PVP_MODE_QEME ? calculateQemeScore(rawNumber) : calculateRemeScore(rawNumber);
  return {
    rawNumber,
    score,
    rank: mode === PVP_MODE_QEME ? getQemeRankValue(score) : getRemeRankValue(score),
    createdAt: new Date().toISOString()
  };
};

const createPvpRoomRecord = ({
  roomCode,
  mode,
  bet,
  chatId,
  player1,
  player2 = null,
  status = "waiting",
  round = 1,
  waitingExpiresAt = null,
  duelExpiresAt = null,
  createdAt = new Date().toISOString(),
  updatedAt = createdAt
}) => ({
  roomCode,
  mode,
  bet,
  pot: player2 ? bet * 2 : bet,
  chatId: String(chatId || ""),
  status,
  round,
  waitingExpiresAt,
  duelExpiresAt,
  player1,
  player2,
  createdAt,
  updatedAt
});

const createDefaultData = () => ({
  meta: {
    version: DB_VERSION,
    updatedAt: new Date().toISOString(),
    nextPrimaryId: 1
  },
  indexes: {
    primaryIdToPhone: {}
  },
  registrations: {},
  pvp: createPvpStore()
});

const createPlayerRecord = (
  phoneNumber,
  primaryId,
  existing = {},
  now = new Date().toISOString(),
  displayName = phoneNumber
) => ({
  primaryId,
  phoneNumber,
  displayName: normalizeDisplayName(existing.displayName || existing.name, displayName),
  coins: normalizeCount(existing.coins, 0),
  isRegistered: existing.isRegistered !== false,
  inventory: createInventory(existing.inventory),
  effects: createEffects(existing.effects),
  ban: createBanState(existing.ban),
  createdAt: typeof existing.createdAt === "string" ? existing.createdAt : now,
  updatedAt: typeof existing.updatedAt === "string" ? existing.updatedAt : now
});

const createSafeLogger = (logger = {}) => {
  const noop = () => {};

  return {
    debug: typeof logger.debug === "function" ? logger.debug.bind(logger) : noop,
    info: typeof logger.info === "function" ? logger.info.bind(logger) : noop,
    warn: typeof logger.warn === "function" ? logger.warn.bind(logger) : noop,
    error: typeof logger.error === "function" ? logger.error.bind(logger) : noop
  };
};

class JsonDatabase {
  constructor(filePath, logger, options = {}) {
    this.filePath = filePath;
    this.backupPath = `${filePath}.bak`;
    this.logger = createSafeLogger(logger);
    this.data = createDefaultData();
    this.writeQueue = Promise.resolve();
    this.random = typeof options.random === "function" ? options.random : Math.random;
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    const primaryRead = await this._readJSON(this.filePath);
    if (primaryRead.ok) {
      this.data = this._sanitize(primaryRead.value);
      this.logger.debug({
        event: "db.load.primary",
        file: this.filePath
      });

      if (JSON.stringify(primaryRead.value) !== JSON.stringify(this.data)) {
        await this._queueWrite(() => this._atomicWrite(this.data));
        this.logger.info({
          event: "db.migrate.primary",
          file: this.filePath,
          version: DB_VERSION
        });
      }

      return;
    }

    if (primaryRead.exists) {
      this.logger.warn({
        event: "db.load.primary_failed",
        file: this.filePath,
        reason: primaryRead.error?.message
      });
    }

    const backupRead = await this._readJSON(this.backupPath);
    if (backupRead.ok) {
      this.data = this._sanitize(backupRead.value);
      this.logger.warn({
        event: "db.recover.from_backup",
        backup: this.backupPath
      });
      await this._queueWrite(() => this._atomicWrite(this.data, { createBackup: false }));
      return;
    }

    if (primaryRead.exists) {
      const corruptTarget = `${this.filePath}.corrupt-${Date.now()}`;
      await fs.rename(this.filePath, corruptTarget).catch(() => null);
      this.logger.error({
        event: "db.quarantine.corrupt_primary",
        from: this.filePath,
        to: corruptTarget
      });
    }

    this.data = createDefaultData();
    await this._queueWrite(() => this._atomicWrite(this.data, { createBackup: false }));
    this.logger.info({
      event: "db.init.default",
      file: this.filePath
    });
  }

  getSnapshot() {
    return clone(this.data);
  }

  getUserByPhone(phoneNumber) {
    const key = normalizePhoneNumber(phoneNumber);
    if (!key) {
      return null;
    }

    return this.data.registrations[key] ? clone(this.data.registrations[key]) : null;
  }

  getRegistration(phoneNumber) {
    return this.getUserByPhone(phoneNumber);
  }

  getPhoneByPrimaryId(primaryId) {
    const key = formatPrimaryId(primaryId);
    if (!key) {
      return "";
    }

    return this.data.indexes.primaryIdToPhone[key] || "";
  }

  getUserByPrimaryId(primaryId) {
    const phoneNumber = this.getPhoneByPrimaryId(primaryId);
    return phoneNumber ? this.getUserByPhone(phoneNumber) : null;
  }

  getUserByIdentifier(targetIdentifier) {
    const phoneNumber = this._resolveTargetToPhone(targetIdentifier);
    return phoneNumber ? this.getUserByPhone(phoneNumber) : null;
  }

  async syncUserState(phoneNumber, displayName = "") {
    const key = normalizePhoneNumber(phoneNumber);
    if (!key) {
      return {
        user: null,
        isBanned: false,
        expired: false
      };
    }

    return this._queueWrite(async () => {
      const user = this.data.registrations[key];
      if (!user) {
        return {
          user: null,
          isBanned: false,
          expired: false
        };
      }

      const now = new Date().toISOString();
      let dirty = false;
      let expired = false;

      const nextName = normalizeDisplayName(displayName, user.displayName || key);
      if (displayName && nextName !== user.displayName) {
        user.displayName = nextName;
        dirty = true;
      }

      if (this._isBanExpired(user.ban)) {
        user.ban = createBanState();
        expired = true;
        dirty = true;
      }

      if (dirty) {
        user.updatedAt = now;
        this.data.meta.updatedAt = now;
        await this._atomicWrite(this.data);
      }

      return {
        user: clone(user),
        isBanned: Boolean(user.ban?.active),
        expired
      };
    });
  }

  async registerUser(phoneNumber, displayName = "") {
    const key = normalizePhoneNumber(phoneNumber);
    if (!key) {
      throw new Error("Nomor pengirim tidak valid");
    }

    return this._queueWrite(async () => {
      const now = new Date().toISOString();
      const existing = this.data.registrations[key];

      if (existing) {
        existing.phoneNumber = key;
        existing.displayName = normalizeDisplayName(displayName, existing.displayName || key);
        existing.isRegistered = true;
        existing.updatedAt = now;

        if (this._isBanExpired(existing.ban)) {
          existing.ban = createBanState();
        }

        this.data.indexes.primaryIdToPhone[String(existing.primaryId)] = key;
        this.data.meta.updatedAt = now;

        await this._atomicWrite(this.data);

        this.logger.debug({
          event: "db.user.register.existing",
          phoneNumber: key,
          primaryId: existing.primaryId
        });

        return {
          created: false,
          user: clone(existing)
        };
      }

      const primaryId = this._takeNextPrimaryId();
      const user = createPlayerRecord(key, primaryId, {}, now, displayName || key);

      this.data.registrations[key] = user;
      this.data.indexes.primaryIdToPhone[String(primaryId)] = key;
      this.data.meta.updatedAt = now;

      await this._atomicWrite(this.data);

      this.logger.debug({
        event: "db.user.register.created",
        phoneNumber: key,
        primaryId
      });

      return {
        created: true,
        user: clone(user)
      };
    });
  }

  async refreshUserProfile(phoneNumber, displayName = "") {
    return this.syncUserState(phoneNumber, displayName);
  }

  async addCoinsToUser(targetIdentifier, amount, actor = "") {
    const parsedAmount = this._parsePositiveAmount(amount);
    const phoneNumber = this._resolveTargetToPhone(targetIdentifier);
    if (!phoneNumber) {
      throw new Error("Target user tidak ditemukan");
    }

    return this._queueWrite(async () => {
      const user = this.data.registrations[phoneNumber];
      if (!user) {
        throw new Error("Target user tidak ditemukan");
      }

      user.coins = normalizeCount(user.coins, 0) + parsedAmount;
      user.updatedAt = new Date().toISOString();
      this.data.meta.updatedAt = user.updatedAt;

      await this._atomicWrite(this.data);

      this.logger.debug({
        event: "db.user.coins.added",
        phoneNumber,
        primaryId: user.primaryId,
        amount: parsedAmount,
        actor
      });

      return clone(user);
    });
  }

  async removeCoinsFromUser(targetIdentifier, amount, actor = "") {
    const parsedAmount = this._parsePositiveAmount(amount);
    const phoneNumber = this._resolveTargetToPhone(targetIdentifier);
    if (!phoneNumber) {
      throw new Error("Target user tidak ditemukan");
    }

    return this._queueWrite(async () => {
      const user = this.data.registrations[phoneNumber];
      if (!user) {
        throw new Error("Target user tidak ditemukan");
      }

      if (normalizeCount(user.coins, 0) < parsedAmount) {
        throw new Error("Coin target tidak cukup");
      }

      user.coins -= parsedAmount;
      user.updatedAt = new Date().toISOString();
      this.data.meta.updatedAt = user.updatedAt;

      await this._atomicWrite(this.data);

      this.logger.debug({
        event: "db.user.coins.removed",
        phoneNumber,
        primaryId: user.primaryId,
        amount: parsedAmount,
        actor
      });

      return clone(user);
    });
  }

  async transferCoins(fromIdentifier, toIdentifier, amount, actor = "") {
    const parsedAmount = this._parsePositiveAmount(amount);
    const fromPhone = this._resolveTargetToPhone(fromIdentifier);
    const toPhone = this._resolveTargetToPhone(toIdentifier);

    if (!fromPhone || !toPhone) {
      throw new Error("Target user tidak ditemukan");
    }

    if (fromPhone === toPhone) {
      throw new Error("Tidak bisa transfer coin ke diri sendiri");
    }

    return this._queueWrite(async () => {
      const fromUser = this.data.registrations[fromPhone];
      const toUser = this.data.registrations[toPhone];
      if (!fromUser || !toUser) {
        throw new Error("Target user tidak ditemukan");
      }

      if (normalizeCount(fromUser.coins, 0) < parsedAmount) {
        throw new Error("Coin kamu tidak cukup");
      }

      const now = new Date().toISOString();
      fromUser.coins -= parsedAmount;
      toUser.coins = normalizeCount(toUser.coins, 0) + parsedAmount;
      fromUser.updatedAt = now;
      toUser.updatedAt = now;
      this.data.meta.updatedAt = now;

      await this._atomicWrite(this.data);

      this.logger.debug({
        event: "db.user.coins.transferred",
        fromPhone,
        toPhone,
        amount: parsedAmount,
        actor
      });

      return {
        amount: parsedAmount,
        fromUser: clone(fromUser),
        toUser: clone(toUser)
      };
    });
  }

  async buyItem(targetIdentifier, itemCode, amount, unitPrice) {
    const parsedAmount = this._parsePositiveAmount(amount);
    const price = this._parsePositiveAmount(unitPrice);
    const phoneNumber = this._resolveTargetToPhone(targetIdentifier);
    if (!phoneNumber) {
      throw new Error("Target user tidak ditemukan");
    }

    const code = String(itemCode || "").trim().toLowerCase();
    if (!code) {
      throw new Error("Item shop tidak valid");
    }

    return this._queueWrite(async () => {
      const user = this.data.registrations[phoneNumber];
      if (!user) {
        throw new Error("Target user tidak ditemukan");
      }

      const totalCost = parsedAmount * price;
      if (normalizeCount(user.coins, 0) < totalCost) {
        throw new Error("Coin kamu tidak cukup");
      }

      const now = new Date().toISOString();
      user.coins -= totalCost;
      user.inventory = createInventory(user.inventory);
      user.inventory[code] = normalizeCount(user.inventory[code], 0) + parsedAmount;
      user.updatedAt = now;
      this.data.meta.updatedAt = now;

      await this._atomicWrite(this.data);

      this.logger.debug({
        event: "db.shop.buy",
        phoneNumber,
        primaryId: user.primaryId,
        itemCode: code,
        amount: parsedAmount,
        totalCost
      });

      return {
        totalCost,
        amount: parsedAmount,
        user: clone(user)
      };
    });
  }

  async useChamp(targetIdentifier) {
    const phoneNumber = this._resolveTargetToPhone(targetIdentifier);
    if (!phoneNumber) {
      throw new Error("Target user tidak ditemukan");
    }

    return this._queueWrite(async () => {
      const user = this.data.registrations[phoneNumber];
      if (!user) {
        throw new Error("Target user tidak ditemukan");
      }

      user.inventory = createInventory(user.inventory);
      user.effects = createEffects(user.effects);

      if (normalizeCount(user.inventory.champ, 0) <= 0) {
        throw new Error("Kamu tidak punya item champ");
      }

      if (user.effects.champNextSpin) {
        throw new Error("Boost champ masih aktif untuk spin berikutnya");
      }

      const now = new Date().toISOString();
      user.inventory.champ -= 1;
      user.effects.champNextSpin = true;
      user.updatedAt = now;
      this.data.meta.updatedAt = now;

      await this._atomicWrite(this.data);

      this.logger.debug({
        event: "db.shop.use_champ",
        phoneNumber,
        primaryId: user.primaryId
      });

      return clone(user);
    });
  }

  async spinWheel(targetIdentifier) {
    const phoneNumber = this._resolveTargetToPhone(targetIdentifier);
    if (!phoneNumber) {
      throw new Error("Target user tidak ditemukan");
    }

    return this._queueWrite(async () => {
      const user = this.data.registrations[phoneNumber];
      if (!user) {
        throw new Error("Target user tidak ditemukan");
      }

      const spin = this._rollForUser(user);
      this.data.meta.updatedAt = user.updatedAt;

      await this._atomicWrite(this.data);

      this.logger.debug({
        event: "db.spin.result",
        phoneNumber,
        primaryId: user.primaryId,
        result: spin.rawNumber,
        usedChampBoost: spin.usedChampBoost
      });

      return {
        result: spin.rawNumber,
        usedChampBoost: spin.usedChampBoost,
        user: clone(user)
      };
    });
  }

  async banUser(targetIdentifier, durationMinutes, reason = DEFAULT_REASON, actor = "") {
    const duration = this._parseBanDuration(durationMinutes);
    const phoneNumber = this._resolveTargetToPhone(targetIdentifier);
    if (!phoneNumber) {
      throw new Error("Target user tidak ditemukan");
    }

    return this._queueWrite(async () => {
      const user = this.data.registrations[phoneNumber];
      if (!user) {
        throw new Error("Target user tidak ditemukan");
      }

      const now = new Date().toISOString();
      user.ban = {
        active: true,
        expiresAt: duration === -1 ? null : new Date(Date.now() + duration * 60000).toISOString(),
        reason: normalizeReason(reason),
        bannedBy: String(actor || ""),
        bannedAt: now
      };
      user.updatedAt = now;
      this.data.meta.updatedAt = now;

      await this._atomicWrite(this.data);

      this.logger.debug({
        event: "db.user.banned",
        phoneNumber,
        primaryId: user.primaryId,
        duration,
        actor
      });

      return clone(user);
    });
  }

  async unbanUser(targetIdentifier, reason = DEFAULT_REASON, actor = "") {
    const phoneNumber = this._resolveTargetToPhone(targetIdentifier);
    if (!phoneNumber) {
      throw new Error("Target user tidak ditemukan");
    }

    return this._queueWrite(async () => {
      const user = this.data.registrations[phoneNumber];
      if (!user) {
        throw new Error("Target user tidak ditemukan");
      }

      const now = new Date().toISOString();
      user.ban = createBanState({
        reason: normalizeReason(reason),
        bannedBy: String(actor || ""),
        bannedAt: now
      });
      user.updatedAt = now;
      this.data.meta.updatedAt = now;

      await this._atomicWrite(this.data);

      this.logger.debug({
        event: "db.user.unbanned",
        phoneNumber,
        primaryId: user.primaryId,
        actor
      });

      return clone(user);
    });
  }

  getPvpRoom(roomCode) {
    const key = normalizeRoomCode(roomCode);
    if (!key) {
      return null;
    }

    const room = this.data.pvp?.rooms?.[key];
    return room ? clone(room) : null;
  }

  getPvpRoomByUser(targetIdentifier) {
    const phoneNumber = this._resolveTargetToPhone(targetIdentifier);
    if (!phoneNumber) {
      return null;
    }

    const roomCode = this.data.pvp?.userToRoom?.[phoneNumber];
    if (!roomCode) {
      return null;
    }

    const room = this.data.pvp?.rooms?.[roomCode];
    return room ? clone(room) : null;
  }

  getWaitingPvpRooms() {
    return Object.values(this.data.pvp?.rooms || {})
      .filter((room) => room?.status === "waiting")
      .sort((left, right) => {
        const leftTime = Date.parse(left?.createdAt || left?.updatedAt || 0) || 0;
        const rightTime = Date.parse(right?.createdAt || right?.updatedAt || 0) || 0;
        return leftTime - rightTime || String(left?.roomCode || "").localeCompare(String(right?.roomCode || ""));
      })
      .map((room) => clone(room));
  }

  async sweepExpiredPvpRooms(now = Date.now()) {
    return this._queueWrite(async () => {
      const settlements = this._settleExpiredPvpRoomsLocked(now);
      if (!settlements.length) {
        return [];
      }

      await this._atomicWrite(this.data);
      return clone(settlements);
    });
  }

  async createPvpRoom({
    mode,
    roomCode,
    bet,
    chatId,
    creatorPhoneNumber,
    creatorDisplayName = ""
  }) {
    const normalizedMode = normalizePvpMode(mode);
    if (!normalizedMode) {
      throw new Error("Mode PVP tidak valid");
    }

    if (normalizedMode !== PVP_MODE_REME && normalizedMode !== PVP_MODE_QEME) {
      throw new Error(`Mode ${normalizedMode} belum tersedia`);
    }

    const normalizedRoomCode = normalizeRoomCode(roomCode);
    if (!normalizedRoomCode) {
      throw new Error("Code room tidak valid");
    }

    const parsedBet = this._parsePositiveAmount(bet);
    if (parsedBet < PVP_MIN_BET) {
      throw new Error(`Minimal bet ${PVP_MIN_BET}`);
    }

    const creatorPhone = normalizePhoneNumber(creatorPhoneNumber);
    if (!creatorPhone) {
      throw new Error("Player 1 tidak valid");
    }

    return this._queueWrite(async () => {
      this._settleExpiredPvpRoomsLocked();

      const creatorUser = this.data.registrations[creatorPhone];
      if (!creatorUser || creatorUser.isRegistered === false) {
        throw new Error("Player 1 belum terdaftar");
      }

      if (this.data.pvp.userToRoom[creatorPhone]) {
        throw new Error("Kamu masih punya room PVP aktif");
      }

      if (this.data.pvp.rooms[normalizedRoomCode]) {
        throw new Error(`Room ${normalizedRoomCode} sudah digunakan`);
      }

      if (normalizeCount(creatorUser.coins, 0) < parsedBet) {
        throw new Error("Coin kamu tidak cukup");
      }

      const now = new Date().toISOString();
      creatorUser.coins -= parsedBet;
      creatorUser.updatedAt = now;

      const room = createPvpRoomRecord({
        roomCode: normalizedRoomCode,
        mode: normalizedMode,
        bet: parsedBet,
        chatId,
        player1: createPvpParticipant(creatorUser, creatorDisplayName || creatorUser.displayName),
        waitingExpiresAt: new Date(Date.now() + PVP_WAIT_TIMEOUT_MS).toISOString(),
        createdAt: now,
        updatedAt: now
      });

      this.data.pvp.rooms[normalizedRoomCode] = room;
      this.data.pvp.userToRoom[creatorPhone] = normalizedRoomCode;
      this.data.meta.updatedAt = now;

      await this._atomicWrite(this.data);

      return {
        room: clone(room),
        creatorUser: clone(creatorUser)
      };
    });
  }

  async joinPvpRoom({
    mode,
    roomCode,
    chatId,
    joinerPhoneNumber,
    joinerDisplayName = ""
  }) {
    const normalizedMode = normalizePvpMode(mode);
    if (!normalizedMode) {
      throw new Error("Mode PVP tidak valid");
    }

    if (normalizedMode !== PVP_MODE_REME && normalizedMode !== PVP_MODE_QEME) {
      throw new Error(`Mode ${normalizedMode} belum tersedia`);
    }

    const normalizedRoomCode = normalizeRoomCode(roomCode);
    if (!normalizedRoomCode) {
      throw new Error("Code room tidak valid");
    }

    const joinerPhone = normalizePhoneNumber(joinerPhoneNumber);
    if (!joinerPhone) {
      throw new Error("Player 2 tidak valid");
    }

    return this._queueWrite(async () => {
      this._settleExpiredPvpRoomsLocked();

      const room = this.data.pvp.rooms[normalizedRoomCode];
      if (!room || room.mode !== normalizedMode || room.status !== "waiting") {
        throw new Error(`Room ${normalizedRoomCode} tidak ditemukan`);
      }

      if (room.player1.phoneNumber === joinerPhone) {
        throw new Error("Kamu tidak bisa join room buatan sendiri");
      }

      const joinerUser = this.data.registrations[joinerPhone];
      if (!joinerUser || joinerUser.isRegistered === false) {
        throw new Error("Player 2 belum terdaftar");
      }

      if (this.data.pvp.userToRoom[joinerPhone]) {
        throw new Error("Kamu masih punya room PVP aktif");
      }

      if (normalizeCount(joinerUser.coins, 0) < room.bet) {
        throw new Error("Coin kamu tidak cukup");
      }

      const now = new Date().toISOString();
      joinerUser.coins -= room.bet;
      joinerUser.updatedAt = now;
      room.player2 = createPvpParticipant(joinerUser, joinerDisplayName || joinerUser.displayName);
      room.status = "active";
      room.chatId = String(chatId || room.chatId || "");
      room.pot = room.bet * 2;
      room.waitingExpiresAt = null;
      room.duelExpiresAt = new Date(Date.now() + PVP_DUEL_TIMEOUT_MS).toISOString();
      room.updatedAt = now;

      this.data.pvp.userToRoom[joinerPhone] = normalizedRoomCode;
      this.data.meta.updatedAt = now;

      await this._atomicWrite(this.data);

      return {
        room: clone(room),
        joinerUser: clone(joinerUser)
      };
    });
  }

  async spinPvpRound(targetIdentifier, displayName = "") {
    const phoneNumber = this._resolveTargetToPhone(targetIdentifier);
    if (!phoneNumber) {
      throw new Error("Target user tidak ditemukan");
    }

    return this._queueWrite(async () => {
      this._settleExpiredPvpRoomsLocked();

      const roomCode = this.data.pvp.userToRoom[phoneNumber];
      const room = roomCode ? this.data.pvp.rooms[roomCode] : null;
      if (!room || room.status !== "active") {
        throw new Error("Kamu tidak sedang berada di duel PVP aktif");
      }

      const user = this.data.registrations[phoneNumber];
      if (!user) {
        throw new Error("User duel tidak ditemukan");
      }

      const participantKey =
        room.player1.phoneNumber === phoneNumber
          ? "player1"
          : room.player2?.phoneNumber === phoneNumber
            ? "player2"
            : "";

      if (!participantKey) {
        throw new Error("Kamu bukan peserta room ini");
      }

      const participant = room[participantKey];
      this._syncPvpParticipantProfile(participant, user, displayName);

      if (participant.spin) {
        throw new Error("Kamu sudah spin di round ini");
      }

      const now = new Date().toISOString();
      const spin = this._rollForUser(user, room.mode);
      participant.spin = spin;
      room.updatedAt = now;
      this.data.meta.updatedAt = now;

      const otherParticipant = participantKey === "player1" ? room.player2 : room.player1;
      if (!otherParticipant?.spin) {
        await this._atomicWrite(this.data);
        return {
          type: "waiting_opponent",
          room: clone(room),
          actor: clone(participant),
          spin: clone(spin)
        };
      }

      const player1Spin = clone(room.player1.spin);
      const player2Spin = clone(room.player2.spin);

      if (player1Spin.rank === player2Spin.rank) {
        room.round += 1;
        room.player1.spin = null;
        room.player2.spin = null;
        room.duelExpiresAt = new Date(Date.now() + PVP_DUEL_TIMEOUT_MS).toISOString();
        room.updatedAt = new Date().toISOString();
        this.data.meta.updatedAt = room.updatedAt;

        await this._atomicWrite(this.data);
        return {
          type: "tie",
          room: clone(room),
          previousRound: {
            player1: player1Spin,
            player2: player2Spin
          }
        };
      }

      const winnerKey = player1Spin.rank > player2Spin.rank ? "player1" : "player2";
      const settlement = this._settlePvpWinnerRoomLocked(room.roomCode, winnerKey, {
        reason: "spin_win",
        player1Spin,
        player2Spin,
        round: room.round
      });

      await this._atomicWrite(this.data);
      return clone(settlement);
    });
  }

  getLeaderboard(limit = 10) {
    const parsedLimit = Math.max(1, toSafeInteger(limit, 10));
    return Object.values(this.data.registrations)
      .filter((user) => user.isRegistered !== false)
      .map((user) => clone(user))
      .sort((left, right) => right.coins - left.coins || left.primaryId - right.primaryId)
      .slice(0, parsedLimit);
  }

  getUserRank(targetIdentifier) {
    const phoneNumber = this._resolveTargetToPhone(targetIdentifier);
    if (!phoneNumber) {
      return null;
    }

    const ranked = Object.values(this.data.registrations)
      .filter((user) => user.isRegistered !== false)
      .sort((left, right) => right.coins - left.coins || left.primaryId - right.primaryId);

    const index = ranked.findIndex((user) => user.phoneNumber === phoneNumber);
    return index === -1 ? null : index + 1;
  }

  _rollForUser(user, pvpMode = "") {
    user.effects = createEffects(user.effects);
    const usedChampBoost = user.effects.champNextSpin === true;
    const rawNumber = rollRoulette(this.random, usedChampBoost);
    if (usedChampBoost) {
      user.effects.champNextSpin = false;
    }

    user.updatedAt = new Date().toISOString();

    return {
      ...createPvpSpin(rawNumber, pvpMode === PVP_MODE_QEME ? PVP_MODE_QEME : PVP_MODE_REME),
      usedChampBoost
    };
  }

  _syncPvpParticipantProfile(participant, user, displayName = "") {
    if (!participant || !user) {
      return;
    }

    participant.phoneNumber = user.phoneNumber;
    participant.primaryId = user.primaryId;
    participant.displayName = normalizeDisplayName(displayName, user.displayName || user.phoneNumber);
  }

  _removePvpRoomLocked(roomCode) {
    const room = this.data.pvp.rooms[roomCode];
    if (!room) {
      return;
    }

    if (room.player1?.phoneNumber) {
      delete this.data.pvp.userToRoom[room.player1.phoneNumber];
    }

    if (room.player2?.phoneNumber) {
      delete this.data.pvp.userToRoom[room.player2.phoneNumber];
    }

    delete this.data.pvp.rooms[roomCode];
  }

  _refundPvpRoomLocked(roomCode, reason) {
    const room = this.data.pvp.rooms[roomCode];
    if (!room) {
      return null;
    }

    const now = new Date().toISOString();
    const refundedPlayers = [];

    for (const participant of [room.player1, room.player2].filter(Boolean)) {
      const user = this.data.registrations[participant.phoneNumber];
      if (!user) {
        continue;
      }

      user.coins = normalizeCount(user.coins, 0) + room.bet;
      user.updatedAt = now;
      refundedPlayers.push({
        phoneNumber: user.phoneNumber,
        primaryId: user.primaryId,
        displayName: user.displayName,
        coins: user.coins
      });
    }

    this.data.meta.updatedAt = now;

    const summary = {
      type: "cancelled",
      reason,
      roomCode: room.roomCode,
      mode: room.mode,
      bet: room.bet,
      pot: room.pot,
      player1: room.player1 ? clone(room.player1) : null,
      player2: room.player2 ? clone(room.player2) : null,
      refundedPlayers
    };

    this._removePvpRoomLocked(roomCode);
    return summary;
  }

  _settlePvpWinnerRoomLocked(roomCode, winnerKey, details = {}) {
    const room = this.data.pvp.rooms[roomCode];
    if (!room) {
      return null;
    }

    const loserKey = winnerKey === "player1" ? "player2" : "player1";
    const winnerParticipant = room[winnerKey];
    const loserParticipant = room[loserKey];
    const winnerUser = winnerParticipant ? this.data.registrations[winnerParticipant.phoneNumber] : null;
    const loserUser = loserParticipant ? this.data.registrations[loserParticipant.phoneNumber] : null;
    if (!winnerParticipant || !winnerUser) {
      return this._refundPvpRoomLocked(roomCode, "invalid_winner_state");
    }

    const now = new Date().toISOString();
    winnerUser.coins = normalizeCount(winnerUser.coins, 0) + room.pot;
    winnerUser.updatedAt = now;
    if (loserUser) {
      loserUser.updatedAt = now;
    }

    this.data.meta.updatedAt = now;

    const summary = {
      type: "win",
      reason: details.reason || "spin_win",
      roomCode: room.roomCode,
      mode: room.mode,
      bet: room.bet,
      pot: room.pot,
      round: details.round || room.round,
      player1: room.player1 ? clone(room.player1) : null,
      player2: room.player2 ? clone(room.player2) : null,
      winner: {
        phoneNumber: winnerUser.phoneNumber,
        primaryId: winnerUser.primaryId,
        displayName: winnerUser.displayName,
        coins: winnerUser.coins
      },
      loser: loserUser
        ? {
            phoneNumber: loserUser.phoneNumber,
            primaryId: loserUser.primaryId,
            displayName: loserUser.displayName,
            coins: loserUser.coins
          }
        : null,
      player1Spin: details.player1Spin ? clone(details.player1Spin) : clone(room.player1?.spin),
      player2Spin: details.player2Spin ? clone(details.player2Spin) : clone(room.player2?.spin)
    };

    this._removePvpRoomLocked(roomCode);
    return summary;
  }

  _settleExpiredPvpRoomsLocked(now = Date.now()) {
    const settlements = [];

    for (const roomCode of Object.keys(this.data.pvp.rooms)) {
      const room = this.data.pvp.rooms[roomCode];
      if (!room) {
        continue;
      }

      if (room.status === "waiting" && room.waitingExpiresAt && isExpiredAt(room.waitingExpiresAt, now)) {
        const settlement = this._refundPvpRoomLocked(roomCode, "waiting_timeout");
        if (settlement) {
          settlements.push(settlement);
        }
        continue;
      }

      if (room.status !== "active" || !room.duelExpiresAt || !isExpiredAt(room.duelExpiresAt, now)) {
        continue;
      }

      const player1Spun = Boolean(room.player1?.spin);
      const player2Spun = Boolean(room.player2?.spin);

      if (player1Spun && !player2Spun) {
        const settlement = this._settlePvpWinnerRoomLocked(roomCode, "player1", {
          reason: "duel_timeout_forfeit",
          player1Spin: room.player1.spin,
          player2Spin: room.player2?.spin || null,
          round: room.round
        });
        if (settlement) {
          settlements.push(settlement);
        }
        continue;
      }

      if (player2Spun && !player1Spun) {
        const settlement = this._settlePvpWinnerRoomLocked(roomCode, "player2", {
          reason: "duel_timeout_forfeit",
          player1Spin: room.player1?.spin || null,
          player2Spin: room.player2.spin,
          round: room.round
        });
        if (settlement) {
          settlements.push(settlement);
        }
        continue;
      }

      const settlement = this._refundPvpRoomLocked(roomCode, "duel_timeout_idle");
      if (settlement) {
        settlements.push(settlement);
      }
    }

    return settlements;
  }

  _parsePositiveAmount(value) {
    const parsed = toSafeInteger(value, NaN);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error("Jumlah coin tidak valid");
    }

    return parsed;
  }

  _parseBanDuration(value) {
    const parsed = toSafeInteger(value, NaN);
    if (!Number.isFinite(parsed) || parsed === 0 || parsed < -1) {
      throw new Error("Durasi ban tidak valid");
    }

    return parsed;
  }

  _resolveTargetToPhone(targetIdentifier) {
    const primaryId = normalizePrimaryId(targetIdentifier);
    if (primaryId) {
      const phoneById = this.getPhoneByPrimaryId(primaryId);
      if (phoneById) {
        return phoneById;
      }
    }

    return normalizePhoneNumber(targetIdentifier);
  }

  _takeNextPrimaryId() {
    let sequence = Math.max(1, toSafeInteger(this.data.meta.nextPrimaryId, 1));

    while (this.data.indexes.primaryIdToPhone[String(sequence)]) {
      sequence += 1;
    }

    this.data.meta.nextPrimaryId = sequence + 1;
    return sequence;
  }

  _isBanExpired(ban) {
    return Boolean(ban?.active) && Boolean(ban?.expiresAt) && isExpiredAt(ban.expiresAt);
  }

  _queueWrite(task) {
    const run = this.writeQueue.then(task, task);
    this.writeQueue = run.catch((error) => {
      this.logger.error({
        event: "db.write.queue_error",
        reason: error?.message
      });
    });
    return run;
  }

  async _atomicWrite(payload, { createBackup = true } = {}) {
    const tmpPath = `${this.filePath}.tmp`;
    const json = JSON.stringify(payload, null, 2);

    if (createBackup && (await this._exists(this.filePath))) {
      await fs.copyFile(this.filePath, this.backupPath).catch((error) => {
        this.logger.warn({
          event: "db.backup.copy_failed",
          backup: this.backupPath,
          reason: error?.message
        });
      });
    }

    try {
      await fs.writeFile(tmpPath, json, "utf8");
      await this._replaceFile(tmpPath, this.filePath);
    } finally {
      await fs.rm(tmpPath, { force: true }).catch(() => null);
    }
  }

  async _replaceFile(source, destination) {
    try {
      await fs.rename(source, destination);
      return;
    } catch (error) {
      const fallbackCodes = new Set(["EEXIST", "EPERM", "EBUSY", "ENOTEMPTY"]);
      if (!fallbackCodes.has(error.code)) {
        throw error;
      }
    }

    await fs.rm(destination, { force: true }).catch(() => null);
    await fs.rename(source, destination);
  }

  async _readJSON(filePath) {
    let raw = "";
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        return { ok: false, exists: false, error };
      }

      return { ok: false, exists: true, error };
    }

    try {
      const value = JSON.parse(raw);
      return { ok: true, exists: true, value };
    } catch (error) {
      return { ok: false, exists: true, error };
    }
  }

  _sanitize(input) {
    const output = createDefaultData();
    const source = isPlainObject(input) ? input : {};
    const usedPrimaryIds = new Set();

    if (isPlainObject(source.meta)) {
      output.meta.updatedAt =
        typeof source.meta.updatedAt === "string"
          ? source.meta.updatedAt
          : output.meta.updatedAt;
      output.meta.nextPrimaryId = Math.max(1, toSafeInteger(source.meta.nextPrimaryId, 1));
    }

    const draftUsers = [];
    if (isPlainObject(source.registrations)) {
      for (const [phone, rawValue] of Object.entries(source.registrations)) {
        if (!isPlainObject(rawValue)) {
          continue;
        }

        const normalizedPhone = normalizePhoneNumber(rawValue.phoneNumber || phone);
        if (!normalizedPhone) {
          continue;
        }

        let primaryId = normalizeLegacyPrimaryId(rawValue.primaryId);
        if (primaryId && usedPrimaryIds.has(primaryId)) {
          primaryId = null;
        }

        const createdAt =
          typeof rawValue.createdAt === "string"
            ? rawValue.createdAt
            : typeof rawValue.updatedAt === "string"
              ? rawValue.updatedAt
              : output.meta.updatedAt;

        const updatedAt =
          typeof rawValue.updatedAt === "string" ? rawValue.updatedAt : createdAt;

        const user = createPlayerRecord(
          normalizedPhone,
          primaryId,
          {
            displayName: rawValue.displayName || rawValue.name,
            coins: rawValue.coins,
            isRegistered: rawValue.isRegistered,
            inventory: rawValue.inventory,
            effects: rawValue.effects,
            ban: rawValue.ban,
            createdAt,
            updatedAt
          },
          output.meta.updatedAt,
          normalizedPhone
        );

        if (this._isBanExpired(user.ban)) {
          user.ban = createBanState();
        }

        draftUsers.push(user);

        if (primaryId) {
          usedPrimaryIds.add(primaryId);
          output.meta.nextPrimaryId = Math.max(output.meta.nextPrimaryId, primaryId + 1);
        }
      }
    }

    for (const user of draftUsers) {
      if (!user.primaryId) {
        let nextId = Math.max(1, output.meta.nextPrimaryId);
        while (usedPrimaryIds.has(nextId)) {
          nextId += 1;
        }

        user.primaryId = nextId;
        usedPrimaryIds.add(nextId);
        output.meta.nextPrimaryId = Math.max(output.meta.nextPrimaryId, nextId + 1);
      }

      output.registrations[user.phoneNumber] = user;
      output.indexes.primaryIdToPhone[String(user.primaryId)] = user.phoneNumber;
    }

    if (isPlainObject(source.pvp) && isPlainObject(source.pvp.rooms)) {
      const activeUsers = new Set();

      for (const [rawRoomCode, rawRoom] of Object.entries(source.pvp.rooms)) {
        if (!isPlainObject(rawRoom)) {
          continue;
        }

        const roomCode = normalizeRoomCode(rawRoom.roomCode || rawRoomCode);
        const mode = normalizePvpMode(rawRoom.mode);
        const bet = normalizeCount(rawRoom.bet, 0);
        const player1Phone = normalizePhoneNumber(rawRoom.player1?.phoneNumber);
        const player2Phone = normalizePhoneNumber(rawRoom.player2?.phoneNumber);
        const status =
          rawRoom.status === "active" && player2Phone
            ? "active"
            : rawRoom.status === "waiting"
              ? "waiting"
              : "";

        if (!roomCode || (mode !== PVP_MODE_REME && mode !== PVP_MODE_QEME) || bet < PVP_MIN_BET || !status) {
          continue;
        }

        if (!output.registrations[player1Phone]) {
          continue;
        }

        if (activeUsers.has(player1Phone) || (player2Phone && activeUsers.has(player2Phone))) {
          continue;
        }

        const player1User = output.registrations[player1Phone];
        const player2User = player2Phone ? output.registrations[player2Phone] : null;
        if (status === "active" && !player2User) {
          continue;
        }

        const player1 = createPvpParticipant(
          player1User,
          rawRoom.player1?.displayName || player1User.displayName
        );
        const player2 =
          status === "active"
            ? createPvpParticipant(
                player2User,
                rawRoom.player2?.displayName || player2User.displayName
              )
            : null;

        if (player1 && isPlainObject(rawRoom.player1?.spin)) {
          try {
            player1.spin = createPvpSpin(rawRoom.player1.spin.rawNumber, mode);
          } catch {
            player1.spin = null;
          }
        }

        if (player2 && isPlainObject(rawRoom.player2?.spin)) {
          try {
            player2.spin = createPvpSpin(rawRoom.player2.spin.rawNumber, mode);
          } catch {
            player2.spin = null;
          }
        }

        const createdAt =
          typeof rawRoom.createdAt === "string" ? rawRoom.createdAt : output.meta.updatedAt;
        const updatedAt =
          typeof rawRoom.updatedAt === "string" ? rawRoom.updatedAt : createdAt;

        const room = createPvpRoomRecord({
          roomCode,
          mode,
          bet,
          chatId: rawRoom.chatId,
          player1,
          player2,
          status,
          round: Math.max(1, toSafeInteger(rawRoom.round, 1)),
          waitingExpiresAt:
            typeof rawRoom.waitingExpiresAt === "string" ? rawRoom.waitingExpiresAt : null,
          duelExpiresAt:
            typeof rawRoom.duelExpiresAt === "string" ? rawRoom.duelExpiresAt : null,
          createdAt,
          updatedAt
        });

        output.pvp.rooms[roomCode] = room;
        output.pvp.userToRoom[player1.phoneNumber] = roomCode;
        activeUsers.add(player1.phoneNumber);

        if (player2) {
          output.pvp.userToRoom[player2.phoneNumber] = roomCode;
          activeUsers.add(player2.phoneNumber);
        }
      }
    }

    output.meta.version = DB_VERSION;
    return output;
  }

  async _exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = {
  JsonDatabase,
  DB_VERSION,
  formatPrimaryId,
  normalizePrimaryId,
  createDefaultData
};
