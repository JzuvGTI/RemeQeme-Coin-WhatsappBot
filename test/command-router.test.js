const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const { createCommandRouter } = require("../src/core/command-router");
const { commandMap } = require("../src/commands");
const { JsonDatabase } = require("../src/core/json-db");
const { TOPUP_CAPTION, createTopupContent } = require("../src/commands/topup");

const createMockLogger = () => ({
  debug() {},
  info() {},
  warn() {},
  error() {}
});

const makeTempPath = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pvp-duel-router-"));
  return {
    dir,
    file: path.join(dir, "database.json")
  };
};

const createMockSock = (groupMetadata = {}, options = {}) => {
  const sent = [];
  const participantUpdates = [];
  return {
    sent,
    participantUpdates,
    user: {
      id: options.userJid || "6283822609595@s.whatsapp.net"
    },
    async sendMessage(chatId, content) {
      sent.push({ chatId, ...content, mentions: content.mentions || [] });
    },
    async groupMetadata(chatId) {
      if (!groupMetadata[chatId]) {
        throw new Error("metadata not found");
      }
      return groupMetadata[chatId];
    },
    async groupParticipantsUpdate(chatId, participants, action) {
      participantUpdates.push({ chatId, participants, action });
      return [{ status: "200", jid: participants[0] }];
    }
  };
};

const createRouterEnv = async (metadata = {}, options = {}) => {
  const temp = await makeTempPath();
  const db = new JsonDatabase(temp.file, createMockLogger(), options);
  await db.init();
  const sock = createMockSock(metadata, options);
  const config = {
    botName: "PVP DUEL BOT",
    ownerNumbers: ["6285956640569"],
    prefixes: ["/", ".", "!"],
    async addOwnerNumber(phoneNumber) {
      if (this.ownerNumbers.includes(phoneNumber)) {
        return {
          added: false,
          phoneNumber,
          ownerNumbers: [...this.ownerNumbers]
        };
      }

      this.ownerNumbers = [...this.ownerNumbers, phoneNumber];
      return {
        added: true,
        phoneNumber,
        ownerNumbers: [...this.ownerNumbers]
      };
    }
  };
  Object.assign(config, options.configOverrides || {});
  const router = createCommandRouter({
    sock,
    db,
    config,
    logger: createMockLogger(),
    commandMap
  });

  return { db, sock, router };
};

test("private non-owner ditolak", async () => {
  const { sock, router } = await createRouterEnv();

  await router({
    key: {
      remoteJid: "628000000000@s.whatsapp.net",
      fromMe: false
    },
    message: {
      conversation: "/menu"
    }
  });

  assert.equal(sock.sent.length, 1);
  assert.match(sock.sent[0].text, /❌ Akses Ditolak/i);
  assert.match(sock.sent[0].text, /private hanya untuk owner/i);
});

test("owner private bisa akses menu", async () => {
  const { sock, router } = await createRouterEnv();

  await router({
    key: {
      remoteJid: "6285956640569@s.whatsapp.net",
      fromMe: false
    },
    message: {
      conversation: "/menu"
    }
  });

  assert.equal(sock.sent.length, 1);
  assert.match(sock.sent[0].text, /\bMenu\b/i);
  assert.match(sock.sent[0].text, /PVP DUEL BOT/);
  assert.match(sock.sent[0].text, /\/topup/);
});

test("topup mengirim gambar qris dan caption", async () => {
  const { sock, router } = await createRouterEnv();

  await router({
    key: {
      remoteJid: "120363000000000014@g.us",
      participant: "628123456789@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Alpha Player",
    message: {
      extendedTextMessage: {
        text: "/topup"
      }
    }
  });

  assert.equal(sock.sent.length, 1);
  assert.equal(sock.sent[0].caption, TOPUP_CAPTION);
  assert.equal(typeof sock.sent[0].image?.url, "string");
  assert.match(sock.sent[0].image.url, /image[\\/]JzQRIS\.jpg$/);
});

test("pvp QEME create join lalu spin memakai flow duel", async () => {
  const sequence = [0.3, 0.28];
  const { db, sock, router } = await createRouterEnv({}, {
    random: () => sequence.shift() ?? 0
  });
  const alpha = await db.registerUser("628123456789", "Alpha Player");
  const beta = await db.registerUser("628777777777", "Beta Player");
  await db.addCoinsToUser(alpha.user.phoneNumber, 2000, "owner");
  await db.addCoinsToUser(beta.user.phoneNumber, 2000, "owner");

  await router({
    key: {
      remoteJid: "120363000000000015@g.us",
      participant: "628123456789@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Alpha Player",
    message: {
      extendedTextMessage: {
        text: "/pvp QEME 1k Q1"
      }
    }
  });

  assert.equal(db.getUserByPhone(alpha.user.phoneNumber).coins, 1000);
  assert.match(sock.sent[0].text, /PVP QEME/i);
  assert.match(sock.sent[0].text, /Room: Q1/);

  await router({
    key: {
      remoteJid: "120363000000000015@g.us",
      participant: "628777777777@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Beta Player",
    message: {
      extendedTextMessage: {
        text: "/pvp QEME Q1"
      }
    }
  });

  assert.equal(db.getUserByPhone(beta.user.phoneNumber).coins, 1000);
  assert.match(sock.sent[1].text, /PVP QEME/i);
  assert.match(sock.sent[1].text, /Duel dimulai/i);

  await router({
    key: {
      remoteJid: "120363000000000015@g.us",
      participant: "628123456789@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Alpha Player",
    message: {
      extendedTextMessage: {
        text: "/spin"
      }
    }
  });

  assert.equal(sock.sent[2].text, "@628123456789 spun the wheel and got 11 🎡");
  assert.deepEqual(sock.sent[2].mentions, ["628123456789@s.whatsapp.net"]);

  await router({
    key: {
      remoteJid: "120363000000000015@g.us",
      participant: "628777777777@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Beta Player",
    message: {
      extendedTextMessage: {
        text: "/gass"
      }
    }
  });

  assert.equal(sock.sent[3].text, "@628777777777 spun the wheel and got 10 🎡");
  assert.deepEqual(sock.sent[3].mentions, ["628777777777@s.whatsapp.net"]);
  assert.match(sock.sent[4].text, /QEME Result/i);
  assert.match(sock.sent[4].text, /Winner: Beta Player \(ID 2\)/);
  assert.match(sock.sent[4].text, /Player 1: Alpha Player = 11 -> 1/);
  assert.match(sock.sent[4].text, /Player 2: Beta Player = 10 -> 10/);
  assert.equal(db.getUserByPhone(beta.user.phoneNumber).coins, 3000);
  assert.equal(db.getPvpRoom("Q1"), null);
});

test("pvp REME create join lalu spin memakai flow duel", async () => {
  const sequence = [0.76, 0.44];
  const { db, sock, router } = await createRouterEnv({}, {
    random: () => sequence.shift() ?? 0
  });
  const alpha = await db.registerUser("628123456789", "Alpha Player");
  const beta = await db.registerUser("628777777777", "Beta Player");
  await db.addCoinsToUser(alpha.user.phoneNumber, 2000, "owner");
  await db.addCoinsToUser(beta.user.phoneNumber, 2000, "owner");

  await router({
    key: {
      remoteJid: "120363000000000016@g.us",
      participant: "628123456789@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Alpha Player",
    message: {
      extendedTextMessage: {
        text: "/pvp REME 1k R1"
      }
    }
  });

  assert.equal(db.getUserByPhone(alpha.user.phoneNumber).coins, 1000);
  assert.match(sock.sent[0].text, /Menunggu lawan/i);
  assert.match(sock.sent[0].text, /Room: R1/);

  await router({
    key: {
      remoteJid: "120363000000000016@g.us",
      participant: "628777777777@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Beta Player",
    message: {
      extendedTextMessage: {
        text: "/pvp REME R1"
      }
    }
  });

  assert.equal(db.getUserByPhone(beta.user.phoneNumber).coins, 1000);
  assert.match(sock.sent[1].text, /Duel dimulai/i);

  await router({
    key: {
      remoteJid: "120363000000000016@g.us",
      participant: "628123456789@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Alpha Player",
    message: {
      extendedTextMessage: {
        text: "/spin"
      }
    }
  });

  assert.equal(sock.sent[2].text, "@628123456789 spun the wheel and got 28 🎡");
  assert.deepEqual(sock.sent[2].mentions, ["628123456789@s.whatsapp.net"]);

  await router({
    key: {
      remoteJid: "120363000000000016@g.us",
      participant: "628777777777@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Beta Player",
    message: {
      extendedTextMessage: {
        text: "/spin"
      }
    }
  });

  assert.equal(sock.sent[3].text, "@628777777777 spun the wheel and got 16 🎡");
  assert.deepEqual(sock.sent[3].mentions, ["628777777777@s.whatsapp.net"]);
  assert.match(sock.sent[4].text, /REME Result/i);
  assert.match(sock.sent[4].text, /Winner: Alpha Player \(ID 1\)/);
  assert.match(sock.sent[4].text, /Hadiah: 2[.,]000/);
  assert.equal(db.getUserByPhone(alpha.user.phoneNumber).coins, 3000);
  assert.equal(db.getPvpRoom("R1"), null);
});

test("listroom hanya menampilkan room REME yang ready", async () => {
  const { db, sock, router } = await createRouterEnv();
  const alpha = await db.registerUser("628123456789", "Alpha Player");
  const beta = await db.registerUser("628777777777", "Beta Player");
  const gamma = await db.registerUser("628888888888", "Gamma Player");
  await db.addCoinsToUser(alpha.user.phoneNumber, 2000, "owner");
  await db.addCoinsToUser(beta.user.phoneNumber, 2000, "owner");
  await db.addCoinsToUser(gamma.user.phoneNumber, 2000, "owner");

  await db.createPvpRoom({
    mode: "REME",
    roomCode: "R1",
    bet: 1000,
    chatId: "120363000000000017@g.us",
    creatorPhoneNumber: alpha.user.phoneNumber,
    creatorDisplayName: "Alpha Player"
  });

  await db.createPvpRoom({
    mode: "REME",
    roomCode: "R2",
    bet: 1000,
    chatId: "120363000000000017@g.us",
    creatorPhoneNumber: beta.user.phoneNumber,
    creatorDisplayName: "Beta Player"
  });

  await db.joinPvpRoom({
    mode: "REME",
    roomCode: "R2",
    chatId: "120363000000000017@g.us",
    joinerPhoneNumber: gamma.user.phoneNumber,
    joinerDisplayName: "Gamma Player"
  });

  await router({
    key: {
      remoteJid: "120363000000000017@g.us",
      participant: "628123456789@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Alpha Player",
    message: {
      extendedTextMessage: {
        text: "/listroom"
      }
    }
  });

  assert.equal(sock.sent.length, 1);
  assert.match(sock.sent[0].text, /🧩 List Room/i);
  assert.match(sock.sent[0].text, /Room ID: R1/);
  assert.match(sock.sent[0].text, /Game: REME/);
  assert.match(sock.sent[0].text, /Player: Alpha Player/);
  assert.match(sock.sent[0].text, /Status: Ready/);
  assert.doesNotMatch(sock.sent[0].text, /Room ID: R2/);
});

test("createTopupContent gagal jika file qris tidak ditemukan", async () => {
  await assert.rejects(
    () => createTopupContent(path.join(os.tmpdir(), "missing-qris-file.jpg")),
    /ENOENT/
  );
});

test("regis otomatis membuat profil baru dengan UserID integer", async () => {
  const groupId = "120363000000000000@g.us";
  const { db, sock, router } = await createRouterEnv({
    [groupId]: {
      id: groupId,
      subject: "PVP Group",
      participants: [{ id: "628123456789@s.whatsapp.net" }]
    }
  });

  await router({
    key: {
      remoteJid: groupId,
      participant: "628123456789@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Alpha Player",
    message: { conversation: "/regis" }
  });

  const user = db.getUserByPhone("628123456789");
  assert.ok(user);
  assert.equal(user.primaryId, 1);
  assert.equal(user.coins, 0);
  assert.equal(user.displayName, "Alpha Player");
  assert.match(sock.sent[0].text, /★❯───「PVP DUEL BOT」───❮★/);
  assert.match(sock.sent[0].text, /Registrasi Berhasil/i);
  assert.match(sock.sent[0].text, /UserID: 1/);
});

test("addcoin owner only bisa target by UserID integer", async () => {
  const { db, sock, router } = await createRouterEnv();
  const registered = await db.registerUser("6281111111111", "Target One");

  await router({
    key: {
      remoteJid: "6285956640569@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Owner",
    message: { conversation: `/addcoin ${registered.user.primaryId} 250` }
  });

  assert.equal(db.getUserByPhone("6281111111111").coins, 250);
  assert.match(sock.sent[0].text, /Coin Ditambahkan/i);
});

test("addcoin menerima shorthand nominal seperti 100k", async () => {
  const { db, sock, router } = await createRouterEnv();
  const registered = await db.registerUser("6281111111111", "Target One");

  await router({
    key: {
      remoteJid: "6285956640569@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Owner",
    message: { conversation: `/addcoin ${registered.user.primaryId} 100k` }
  });

  assert.equal(db.getUserByPhone("6281111111111").coins, 100000);
  assert.match(sock.sent[0].text, /Tambah: 100[.,]000/);
});

test("addowner menambah owner baru dan langsung aktif", async () => {
  const { db, sock, router } = await createRouterEnv();
  const target = await db.registerUser("6281111111111", "Target One");

  await router({
    key: {
      remoteJid: "6285956640569@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Owner",
    message: { conversation: "/addowner 628777777777" }
  });

  assert.match(sock.sent[0].text, /Owner Ditambahkan/i);
  assert.match(sock.sent[0].text, /628777777777/);

  await router({
    key: {
      remoteJid: "628777777777@s.whatsapp.net",
      fromMe: false
    },
    pushName: "New Owner",
    message: { conversation: `/addcoin ${target.user.primaryId} 50` }
  });

  assert.equal(db.getUserByPhone("6281111111111").coins, 50);
  assert.match(sock.sent[1].text, /Coin Ditambahkan/i);
});

test("removecoin owner only bisa mengurangi coin by UserID", async () => {
  const { db, sock, router } = await createRouterEnv();
  const target = await db.registerUser("6281111111111", "Target One");
  await db.addCoinsToUser(target.user.phoneNumber, 2000, "owner");

  await router({
    key: {
      remoteJid: "6285956640569@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Owner",
    message: { conversation: `/removecoin ${target.user.primaryId} 1k` }
  });

  assert.equal(db.getUserByPhone("6281111111111").coins, 1000);
  assert.match(sock.sent[0].text, /Coin Dikurangi/i);
  assert.match(sock.sent[0].text, /Kurangi: 1[.,]000/);
});

test("removecoin menolak jika saldo target kurang", async () => {
  const { db, sock, router } = await createRouterEnv();
  const target = await db.registerUser("6281111111111", "Target One");
  await db.addCoinsToUser(target.user.phoneNumber, 500, "owner");

  await router({
    key: {
      remoteJid: "6285956640569@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Owner",
    message: { conversation: `/removecoin ${target.user.primaryId} 1k` }
  });

  assert.equal(db.getUserByPhone("6281111111111").coins, 500);
  assert.match(sock.sent[0].text, /Coin target tidak cukup/i);
});

test("owner group dengan participant lid tetap dikenali sebagai owner", async () => {
  const groupId = "120363000000000001@g.us";
  const { db, sock, router } = await createRouterEnv({
    [groupId]: {
      id: groupId,
      subject: "PVP Group",
      participants: [
        {
          id: "6285956640569@s.whatsapp.net",
          lid: "191667277680762@lid",
          admin: "superadmin"
        },
        {
          id: "6281111111111@s.whatsapp.net"
        }
      ]
    }
  });
  const target = await db.registerUser("6281111111111", "Target One");

  await router({
    key: {
      remoteJid: groupId,
      participant: "191667277680762@lid",
      fromMe: false
    },
    pushName: "Owner",
    message: {
      extendedTextMessage: {
        text: `/addcoin ${target.user.primaryId} 50`
      }
    }
  });

  assert.equal(db.getUserByPhone("6281111111111").coins, 50);
  assert.match(sock.sent[0].text, /Coin Ditambahkan/i);
});

test("profile tanpa target menampilkan diri sendiri", async () => {
  const { db, sock, router } = await createRouterEnv();
  await db.registerUser("628123456789", "Alpha Player");

  await router({
    key: {
      remoteJid: "120363000000000002@g.us",
      participant: "628123456789@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Alpha Player",
    message: {
      extendedTextMessage: {
        text: "/profile"
      }
    }
  });

  assert.equal(sock.sent.length, 1);
  assert.match(sock.sent[0].text, /★❯───「PVP DUEL BOT」───❮★/);
  assert.match(sock.sent[0].text, /\bProfile\b/i);
  assert.match(sock.sent[0].text, /UserID: 1/);
  assert.match(sock.sent[0].text, /Rank: Top #1 Global/);
  assert.match(sock.sent[0].text, /Champagne: 0/);
});

test("profile mention dengan target lid ter-resolve ke nomor asli", async () => {
  const groupId = "120363000000000008@g.us";
  const { db, sock, router } = await createRouterEnv({
    [groupId]: {
      id: groupId,
      subject: "PVP Group",
      participants: [
        {
          id: "191667277680763@lid",
          jid: "6282177368730@s.whatsapp.net"
        },
        {
          id: "6285956640569@s.whatsapp.net",
          admin: "superadmin"
        }
      ]
    }
  });

  await db.registerUser("6282177368730", "Susanto Tjeh");

  await router({
    key: {
      remoteJid: groupId,
      participant: "6285956640569@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Owner",
    message: {
      extendedTextMessage: {
        text: "/profile @susanto",
        contextInfo: {
          mentionedJid: ["191667277680763@lid"]
        }
      }
    }
  });

  assert.equal(sock.sent.length, 1);
  assert.match(sock.sent[0].text, /Susanto Tjeh/);
  assert.match(sock.sent[0].text, /UserID: 1/);
});

test("cekcoin menampilkan coin sendiri tanpa ASCII", async () => {
  const { db, sock, router } = await createRouterEnv();
  const user = await db.registerUser("628123456789", "Alpha Player");
  await db.addCoinsToUser(user.user.phoneNumber, 1250, "owner");

  await router({
    key: {
      remoteJid: "120363000000000009@g.us",
      participant: "628123456789@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Alpha Player",
    message: {
      extendedTextMessage: {
        text: "/cc"
      }
    }
  });

  assert.equal(sock.sent.length, 1);
  assert.match(sock.sent[0].text, /^Coin kamu: 1[.,]250$/);
});

test("cekcoin bisa cek target by UserID tanpa ASCII", async () => {
  const { db, sock, router } = await createRouterEnv();
  const target = await db.registerUser("628777777777", "Beta Player");
  await db.addCoinsToUser(target.user.phoneNumber, 2500, "owner");

  await router({
    key: {
      remoteJid: "120363000000000010@g.us",
      participant: "628123456789@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Alpha Player",
    message: {
      extendedTextMessage: {
        text: `/cekcoin ${target.user.primaryId}`
      }
    }
  });

  assert.equal(sock.sent.length, 1);
  assert.match(sock.sent[0].text, /^Coin Beta Player \(UserID: 1\): 2[.,]500$/);
});

test("tfcoin memindahkan coin antar user terdaftar", async () => {
  const { db, sock, router } = await createRouterEnv();
  const sender = await db.registerUser("628123456789", "Alpha Player");
  const receiver = await db.registerUser("628777777777", "Beta Player");
  await db.addCoinsToUser(sender.user.phoneNumber, 500, "owner");

  await router({
    key: {
      remoteJid: "120363000000000004@g.us",
      participant: "628123456789@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Alpha Player",
    message: {
      extendedTextMessage: {
        text: `/tfcoin ${receiver.user.primaryId} 200`
      }
    }
  });

  assert.equal(db.getUserByPhone("628123456789").coins, 300);
  assert.equal(db.getUserByPhone("628777777777").coins, 200);
  assert.match(sock.sent[0].text, /Transfer Coin/i);
});

test("tfcoin menerima shorthand desimal seperti 1.5k", async () => {
  const { db, sock, router } = await createRouterEnv();
  const sender = await db.registerUser("628123456789", "Alpha Player");
  const receiver = await db.registerUser("628777777777", "Beta Player");
  await db.addCoinsToUser(sender.user.phoneNumber, 5000, "owner");

  await router({
    key: {
      remoteJid: "120363000000000012@g.us",
      participant: "628123456789@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Alpha Player",
    message: {
      extendedTextMessage: {
        text: `/tfcoin ${receiver.user.primaryId} 1.5k`
      }
    }
  });

  assert.equal(db.getUserByPhone("628123456789").coins, 3500);
  assert.equal(db.getUserByPhone("628777777777").coins, 1500);
  assert.match(sock.sent[0].text, /Jumlah: 1[.,]500/);
});

test("tfcoin menolak shorthand yang hasilnya bukan integer bulat", async () => {
  const { db, sock, router } = await createRouterEnv();
  const sender = await db.registerUser("628123456789", "Alpha Player");
  const receiver = await db.registerUser("628777777777", "Beta Player");
  await db.addCoinsToUser(sender.user.phoneNumber, 5000, "owner");

  await router({
    key: {
      remoteJid: "120363000000000013@g.us",
      participant: "628123456789@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Alpha Player",
    message: {
      extendedTextMessage: {
        text: `/tfcoin ${receiver.user.primaryId} 1.2345k`
      }
    }
  });

  assert.equal(db.getUserByPhone("628123456789").coins, 5000);
  assert.equal(db.getUserByPhone("628777777777").coins, 0);
  assert.match(sock.sent[0].text, /Jumlah Tidak Valid/i);
  assert.match(sock.sent[0].text, /100k/);
  assert.match(sock.sent[0].text, /1\.5m/);
});

test("spin menghasilkan satu baris sederhana", async () => {
  const { db, sock, router } = await createRouterEnv({}, { random: () => 0 });
  await db.registerUser("628123456789", "Alpha Player");

  await router({
    key: {
      remoteJid: "120363000000000006@g.us",
      participant: "628123456789@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Alpha Player",
    message: {
      extendedTextMessage: {
        text: "/spin"
      }
    }
  });

  assert.equal(sock.sent.length, 1);
  assert.equal(
    sock.sent[0].text,
    "@628123456789 spun the wheel and got 0 🎡"
  );
  assert.deepEqual(sock.sent[0].mentions, ["628123456789@s.whatsapp.net"]);
});

test("gass adalah alias untuk spin", async () => {
  const { db, sock, router } = await createRouterEnv({}, { random: () => 0.5 });
  await db.registerUser("628123456789", "Alpha Player");

  await router({
    key: {
      remoteJid: "120363000000000007@g.us",
      participant: "628123456789@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Alpha Player",
    message: {
      extendedTextMessage: {
        text: "/gass"
      }
    }
  });

  assert.equal(sock.sent.length, 1);
  assert.match(sock.sent[0].text, /spun the wheel and got/);
  assert.deepEqual(sock.sent[0].mentions, ["628123456789@s.whatsapp.net"]);
});

test("user yang diban tidak bisa menggunakan command apapun", async () => {
  const { db, sock, router } = await createRouterEnv();
  const target = await db.registerUser("628123456789", "Alpha Player");
  await db.banUser(target.user.phoneNumber, -1, "Toxic", "6285956640569");

  await router({
    key: {
      remoteJid: "120363000000000005@g.us",
      participant: "628123456789@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Alpha Player",
    message: {
      extendedTextMessage: {
        text: "/spin"
      }
    }
  });

  assert.equal(sock.sent.length, 1);
  assert.match(sock.sent[0].text, /Kamu sedang dibanned/i);
});

test("infogroup admin menghasilkan informasi inti", async () => {
  const groupId = "120363000000000003@g.us";
  const metadata = {
    [groupId]: {
      id: groupId,
      subject: "PVP Group",
      desc: "Group Duel",
      participants: [
        { id: "628200000001@s.whatsapp.net", admin: "superadmin" },
        { id: "628200000002@s.whatsapp.net", admin: "admin" },
        { id: "628200000003@s.whatsapp.net" }
      ]
    }
  };

  const { sock, router } = await createRouterEnv(metadata);

  await router({
    key: {
      remoteJid: groupId,
      participant: "628200000001@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Admin One",
    message: { conversation: "!infogroup" }
  });

  assert.equal(sock.sent.length, 1);
  assert.match(sock.sent[0].text, /INFORMASI GROUP/i);
  assert.match(sock.sent[0].text, /Member: 3/);
  assert.match(sock.sent[0].text, /Admin: 2/);
});

test("kick bisa dipakai admin group untuk mengeluarkan member", async () => {
  const groupId = "120363000000000018@g.us";
  const metadata = {
    [groupId]: {
      id: groupId,
      subject: "PVP Group",
      participants: [
        { id: "6283822609595@s.whatsapp.net", admin: "admin" },
        { id: "628200000001@s.whatsapp.net", admin: "admin" },
        { id: "628200000002@s.whatsapp.net" }
      ]
    }
  };

  const { sock, router } = await createRouterEnv(metadata, {
    userJid: "6283822609595@s.whatsapp.net"
  });

  await router({
    key: {
      remoteJid: groupId,
      participant: "628200000001@s.whatsapp.net",
      fromMe: false
    },
    pushName: "Admin One",
    message: {
      extendedTextMessage: {
        text: "/kick @member",
        contextInfo: {
          mentionedJid: ["628200000002@s.whatsapp.net"]
        }
      }
    }
  });

  assert.equal(sock.participantUpdates.length, 1);
  assert.deepEqual(sock.participantUpdates[0], {
    chatId: groupId,
    participants: ["628200000002@s.whatsapp.net"],
    action: "remove"
  });
  assert.match(sock.sent[0].text, /Member Dikeluarkan/i);
  assert.match(sock.sent[0].text, /628200000002/);
});
