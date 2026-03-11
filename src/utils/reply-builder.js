const { formatJakartaDateTime } = require("./time");

const sanitizeInline = (value, fallback = "-") => {
  const text = String(value ?? fallback)
    .replace(/\r?\n+/g, " / ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
};

const formatCoins = (value) => {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat("id-ID").format(amount);
};

const row = (label, value) => `${label}: ${sanitizeInline(value)}`;
const header = (botName) => `★❯───「${sanitizeInline(botName)}」───❮★`;

const TITLE_EMOJIS = {
  "Profile": "👤",
  "Registrasi Berhasil": "✅",
  "Sudah Terdaftar": "ℹ️",
  "Owner Ditambahkan": "👑",
  "Owner Sudah Ada": "ℹ️",
  "Coin Ditambahkan": "➕",
  "Coin Dikurangi": "➖",
  "Transfer Coin": "💸",
  "PVP REME": "🎲",
  "REME Tie": "🤝",
  "REME Result": "🏆",
  "Leaderboard Global": "🏅",
  "Menu": "📋",
  "Shop": "🛒",
  "Pembelian Berhasil": "✅",
  "Champ Used": "🥂",
  "User Banned": "⛔",
  "User Unbanned": "✅",
  "Member Dikeluarkan": "👢",
  "Akses Ditolak": "❌",
  "Informasi Group": "👥",
  "Format PVP Salah": "❌",
  "Mode Tidak Valid": "❌",
  "Mode Belum Tersedia": "⏳",
  "Bet Tidak Valid": "❌",
  "Bet Terlalu Kecil": "❌",
  "PVP Gagal": "❌",
  "Spin PVP Gagal": "❌",
  "Spin Gagal": "❌",
  "Jumlah Tidak Valid": "❌",
  "Topup Tidak Tersedia": "❌",
  "List Room": "🧩"
};

const formatTitle = (title) => {
  const safeTitle = sanitizeInline(title, "");
  if (!safeTitle) {
    return "";
  }

  const emoji =
    TITLE_EMOJIS[safeTitle] ||
    (/format|ditolak|tidak valid|tidak ditemukan|tidak dikenal|gagal/i.test(safeTitle)
      ? "❌"
      : /berhasil|unbanned/i.test(safeTitle)
        ? "✅"
        : /menu/i.test(safeTitle)
          ? "📋"
          : /leaderboard/i.test(safeTitle)
            ? "🏅"
            : /profile/i.test(safeTitle)
              ? "👤"
              : /shop/i.test(safeTitle)
                ? "🛒"
                : /pvp|reme|qeme/i.test(safeTitle)
                  ? "🎲"
                  : "");
  return emoji ? `${emoji} ${safeTitle}` : safeTitle;
};

const formatBody = (lines = []) => {
  const safeLines = lines.filter((line) => typeof line === "string" && line.trim() !== "");
  return safeLines.map((line, index) => `${index === safeLines.length - 1 ? "┗" : "┣"}${sanitizeInline(line)}`);
};

const buildMessage = ({ botName, title = "", lines = [] }) =>
  [header(botName), title ? ` ${formatTitle(title)}` : "", ...formatBody(lines)]
    .filter(Boolean)
    .join("\n");

const buildPlayerProfileText = (botName, user, rank = null) =>
  buildMessage({
    botName,
    title: "Profile",
    lines: [
      row("Nama", user.displayName || user.phoneNumber),
      row("UserID", user.primaryId),
      row("Coin", formatCoins(user.coins)),
      row("Champagne", user.inventory?.champ || 0),
      row("Rank", rank ? `Top #${rank} Global` : "-")
    ]
  });

const buildRegisterText = (botName, user, created) =>
  buildMessage({
    botName,
    title: created ? "Registrasi Berhasil" : "Sudah Terdaftar",
    lines: [
      row("Nama", user.displayName || user.phoneNumber),
      row("UserID", user.primaryId),
      row("Coin", formatCoins(user.coins)),
      row("Champagne", user.inventory?.champ || 0)
    ]
  });

const buildAddCoinText = (botName, user, amount) =>
  buildMessage({
    botName,
    title: "Coin Ditambahkan",
    lines: [
      row("Target", user.displayName || user.phoneNumber),
      row("UserID", user.primaryId),
      row("Tambah", formatCoins(amount)),
      row("Coin", formatCoins(user.coins))
    ]
  });

const buildRemoveCoinText = (botName, user, amount) =>
  buildMessage({
    botName,
    title: "Coin Dikurangi",
    lines: [
      row("Target", user.displayName || user.phoneNumber),
      row("UserID", user.primaryId),
      row("Kurangi", formatCoins(amount)),
      row("Coin", formatCoins(user.coins))
    ]
  });

const buildAddOwnerText = (botName, phoneNumber, added, ownerCount) =>
  buildMessage({
    botName,
    title: added ? "Owner Ditambahkan" : "Owner Sudah Ada",
    lines: [
      row("Nomor", phoneNumber),
      row("Total Owner", ownerCount)
    ]
  });

const buildTransferText = (botName, transfer) =>
  buildMessage({
    botName,
    title: "Transfer Coin",
    lines: [
      row("Dari", `${transfer.fromUser.displayName} (ID ${transfer.fromUser.primaryId})`),
      row("Ke", `${transfer.toUser.displayName} (ID ${transfer.toUser.primaryId})`),
      row("Jumlah", formatCoins(transfer.amount)),
      row("Sisa Coin", formatCoins(transfer.fromUser.coins))
    ]
  });

const formatPvpSpin = (spin) => `${spin?.rawNumber ?? "-"} -> ${spin?.score ?? "-"}`;

const buildPvpCreatedText = (botName, room) =>
  buildMessage({
    botName,
    title: `PVP ${room.mode || "REME"}`,
    lines: [
      row("Status", "Menunggu lawan"),
      row("Room", room.roomCode),
      row("Bet", formatCoins(room.bet)),
      row("Pot", formatCoins(room.pot)),
      row("Player 1", `${room.player1.displayName} (ID ${room.player1.primaryId})`),
      row("Timeout", formatJakartaDateTime(room.waitingExpiresAt)),
      row("Join", `/pvp ${room.mode || "REME"} ${room.roomCode}`)
    ]
  });

const buildPvpJoinedText = (botName, room) =>
  buildMessage({
    botName,
    title: `PVP ${room.mode || "REME"}`,
    lines: [
      row("Status", "Duel dimulai"),
      row("Room", room.roomCode),
      row("Bet", formatCoins(room.bet)),
      row("Pot", formatCoins(room.pot)),
      row("Player 1", `${room.player1.displayName} (ID ${room.player1.primaryId})`),
      row("Player 2", `${room.player2.displayName} (ID ${room.player2.primaryId})`),
      row("Timeout", formatJakartaDateTime(room.duelExpiresAt)),
      row("Spin", "/spin atau /gass")
    ]
  });

const buildPvpWaitingSpinText = (botName, room, actor, waitingPlayer) =>
  buildMessage({
    botName,
    title: `${room.mode || "REME"} Round`,
    lines: [
      row("Room", room.roomCode),
      row("Round", room.round),
      row("Status", "Menunggu kedua player spin"),
      row("Sudah Spin", actor.displayName),
      row("Menunggu", waitingPlayer.displayName),
      row("Kalkulasi", "Setelah dua player spin"),
      row("Timeout", formatJakartaDateTime(room.duelExpiresAt))
    ]
  });

const buildPvpTieText = (botName, room, previousRound) =>
  buildMessage({
    botName,
    title: `${room.mode || "REME"} Tie`,
    lines: [
      row("Room", room.roomCode),
      row("Round", room.round - 1),
      row(room.player1.displayName, formatPvpSpin(previousRound.player1)),
      row(room.player2.displayName, formatPvpSpin(previousRound.player2)),
      row("Status", "Tie, spin ulang"),
      row("Timeout Baru", formatJakartaDateTime(room.duelExpiresAt))
    ]
  });

const buildPvpWinnerText = (botName, settlement) =>
  buildMessage({
    botName,
    title: `${settlement.mode || "REME"} Result`,
    lines: [
      row("Room", settlement.roomCode),
      row("Player 1", `${settlement.player1.displayName} = ${formatPvpSpin(settlement.player1Spin)}`),
      row("Player 2", `${settlement.player2.displayName} = ${formatPvpSpin(settlement.player2Spin)}`),
      row("Winner", `${settlement.winner.displayName} (ID ${settlement.winner.primaryId})`),
      row("Hadiah", formatCoins(settlement.pot))
    ]
  });

const buildLeaderboardText = (botName, users = []) => {
  if (!users.length) {
    return buildMessage({
      botName,
      title: "Leaderboard Global",
      lines: ["Belum ada player terdaftar."]
    });
  }

  return buildMessage({
    botName,
    title: "Leaderboard Global",
    lines: users.map(
      (user, index) =>
        `${index + 1}. ${sanitizeInline(user.displayName)} - UserID: ${user.primaryId} - Coin: ${formatCoins(user.coins)}`
    )
  });
};

const buildListRoomText = (botName, rooms = []) => {
  if (!rooms.length) {
    return buildMessage({
      botName,
      title: "List Room",
      lines: ["Tidak ada room ready saat ini."]
    });
  }

  return buildMessage({
    botName,
    title: "List Room",
    lines: rooms.flatMap((room, index) => [
      `${index + 1}. Room ID: ${room.roomCode}`,
      `Game: ${room.mode}`,
      `Player: ${room.player1?.displayName || "-"}`,
      `Status: Ready`
    ])
  });
};

const buildMenuText = (botName, prefixes) => {
  const prefix = prefixes[0] || "/";
  return buildMessage({
    botName,
    title: "Menu",
    lines: [
      `${prefix}help atau ${prefix}menu`,
      `${prefix}regis`,
      `${prefix}profile [UserID/@mention]`,
      `${prefix}cc atau ${prefix}cekcoin [UserID/@mention]`,
      `${prefix}spin atau ${prefix}gass`,
      `${prefix}pvp REME <bet> <roomCode>`,
      `${prefix}pvp REME <roomCode>`,
      `${prefix}pvp QEME <bet> <roomCode>`,
      `${prefix}pvp QEME <roomCode>`,
      `${prefix}listroom`,
      `${prefix}tfcoin <UserID/@mention> <amount>`,
      `${prefix}addcoin <UserID/@mention> <amount>`,
      `${prefix}removecoin <UserID/@mention> <amount>`,
      `${prefix}addowner <nomor>`,
      `Nominal coin: 100 / 100k / 1.5m`,
      `${prefix}topup`,
      `${prefix}shop`,
      `${prefix}buy champ [amount]`,
      `${prefix}use champ`,
      `${prefix}leaderboard atau ${prefix}top`,
      `${prefix}kick @mention`,
      `${prefix}ban <UserID/@mention> <minute|-1> [reason]`,
      `${prefix}unban <UserID/@mention> [reason]`,
      `${prefix}infogroup`,
      `Prefix aktif: ${prefixes.join(" ")}`
    ]
  });
};

const buildShopText = (botName, items) =>
  buildMessage({
    botName,
    title: "Shop",
    lines: items.length
      ? items.map((item) => `${item.code} - ${item.name} - ${formatCoins(item.price)} coin`)
      : ["Shop masih kosong."]
  });

const buildBuyText = (botName, user, item, amount, totalCost) =>
  buildMessage({
    botName,
    title: "Pembelian Berhasil",
    lines: [
      row("Item", `${item.name} x${amount}`),
      row("Kode", item.code),
      row("Biaya", formatCoins(totalCost)),
      row("Coin", formatCoins(user.coins)),
      row("Champagne", user.inventory?.champ || 0)
    ]
  });

const buildUseChampText = (botName, user) =>
  buildMessage({
    botName,
    title: "Champ Used",
    lines: [
      row("Player", user.displayName || user.phoneNumber),
      row("UserID", user.primaryId),
      row("Champagne", user.inventory?.champ || 0),
      row("Boost", "Aktif untuk 1x spin berikutnya")
    ]
  });

const buildBanText = (botName, user, durationMinutes, reason) =>
  buildMessage({
    botName,
    title: "User Banned",
    lines: [
      row("Target", user.displayName || user.phoneNumber),
      row("UserID", user.primaryId),
      row("Durasi", durationMinutes === -1 ? "Permanent" : `${durationMinutes} menit`),
      row("Sampai", user.ban?.expiresAt ? formatJakartaDateTime(user.ban.expiresAt) : "Permanent"),
      row("Reason", reason)
    ]
  });

const buildUnbanText = (botName, user, reason) =>
  buildMessage({
    botName,
    title: "User Unbanned",
    lines: [
      row("Target", user.displayName || user.phoneNumber),
      row("UserID", user.primaryId),
      row("Reason", reason)
    ]
  });

const buildKickText = (botName, targetName, phoneNumber, groupName) =>
  buildMessage({
    botName,
    title: "Member Dikeluarkan",
    lines: [
      row("Target", targetName || phoneNumber),
      row("Nomor", phoneNumber),
      row("Group", groupName || "-")
    ]
  });

const buildBannedText = (botName, user) =>
  buildMessage({
    botName,
    title: "Akses Ditolak",
    lines: [
      row("Status", "Kamu sedang dibanned"),
      row("Reason", user?.ban?.reason || "Unspecified Reason."),
      row("Sampai", user?.ban?.expiresAt ? formatJakartaDateTime(user.ban.expiresAt) : "Permanent")
    ]
  });

const buildInfoGroupText = (botName, metadata, admins, adminNumbers) =>
  buildMessage({
    botName,
    title: "Informasi Group",
    lines: [
      row("ID Group", metadata.id || "-"),
      row("Nama", metadata.subject || "-"),
      row("Deskripsi", metadata.desc || "-"),
      row("Member", metadata.participants?.length || 0),
      row("Admin", admins.length),
      `Admin List: ${admins.length ? admins.join(" | ") : "-"}`,
      `Nomor Admin: ${adminNumbers.length ? adminNumbers.join(" | ") : "-"}`
    ]
  });

const buildAlertText = (botName, title, lines) =>
  buildMessage({
    botName,
    title,
    lines
  });

const buildSpinText = (botName, line) =>
  buildMessage({
    botName,
    lines: [line]
  });

module.exports = {
  formatCoins,
  buildPlayerProfileText,
  buildRegisterText,
  buildAddOwnerText,
  buildAddCoinText,
  buildRemoveCoinText,
  buildTransferText,
  buildPvpCreatedText,
  buildPvpJoinedText,
  buildPvpWaitingSpinText,
  buildPvpTieText,
  buildPvpWinnerText,
  buildListRoomText,
  buildLeaderboardText,
  buildMenuText,
  buildShopText,
  buildBuyText,
  buildUseChampText,
  buildBanText,
  buildUnbanText,
  buildKickText,
  buildBannedText,
  buildInfoGroupText,
  buildAlertText,
  buildSpinText
};

