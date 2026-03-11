# PVP DUEL BOT

Bot WhatsApp modular berbasis Node.js dengan command map, JSON database aman, dan patch keamanan untuk `@hamxyztmvn/baileys-pro`.

## Fitur

- Prefix command: `/`, `.`, `!` (case-insensitive)
- Scope command:
  - Group: aktif
  - Private: hanya owner
- Command:
  - `/help` atau `/menu`
  - `/regis`
  - `/profile`
  - `/profile @mention`
  - `/addcoin <@mention|PVP000001> <jumlah>` (owner only)
  - `/infogroup` (khusus admin group)
- JSON DB:
  - safe read
  - safe write (temp + rename)
  - backup rollback (`.bak`)
  - quarantine file corrupt
- Fully logs command dan aksi inti ke console
- Noise log internal Baileys disenyapkan default lewat `BAILEYS_LOG_LEVEL=silent`
- `postinstall` otomatis mematikan banner startup dan auto-follow tersembunyi dari fork dependency
- Mode terminal dashboard modern lewat `npm run ui`

## Setup

1. Install dependency:

```bash
npm install
```

2. Salin env:

```bash
cp .env.example .env
```

Catatan: untuk prefix 3 mode, gunakan `PREFIXES=/,.,!`.

Jika butuh debug internal library, ubah `BAILEYS_LOG_LEVEL=debug`.

3. Jalankan mode yang diinginkan:

```bash
npm start
```

Atau gunakan terminal dashboard interaktif yang lebih rapi:

```bash
npm run ui
```

Catatan:
- `npm run ui` akan clear screen dan menampilkan panel status, statistik, QR pairing, dan feed event ringkas.
- `npm start` tetap tersedia untuk plain logs/non-interactive.

## Testing

```bash
npm test
```

## Struktur

- `src/core/command-router.js`: parser + authz + eksekusi command map
- `src/commands/`: handler command modular
- `src/core/json-db.js`: layer DB JSON aman
- `src/ui/terminal-dashboard.js`: terminal dashboard ANSI + compact activity feed
- `scripts/postinstall.cjs`: repair dependency internal + patch perilaku noisy/tersembunyi
