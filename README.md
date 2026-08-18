# Bot Telegram Cek Resi Retur Paket

Bot Telegram sederhana untuk mengecek detail resi retur paket dari database PostgreSQL.

## Cara Menjalankan

```bash
npm install
cp .env.example .env
# isi .env dengan kredensial db + TELEGRAM_BOT_TOKEN
npm start
```

## Cara Pakai

1. Buka chat bot Telegram.
2. Kirim nomor resi retur paket langsung di chat.
3. Bot akan membalas detail resi jika ditemukan, atau balasan kosong jika tidak ditemukan.

## Environment Variables

Lihat `.env.example` untuk daftar variabel yang diperlukan.

## Struktur Project

```
src/
├── index.js                # entry point
├── config/env.js           # load & validasi env vars
├── db/pool.js              # pg Pool singleton
├── services/receiptService.js  # query resi + relasi
├── bot/handlers.js         # handler pesan Telegram
├── bot/formatter.js        # format balasan
└── utils/logger.js         # logger
```

## Behavior: Resi Tidak Ditemukan

Bot mengirim pesan `Maaf Bos resi yang anda cari tidak ketemu`.

## Notes

- Bot bersifat **read-only** — tidak ada operasi INSERT/UPDATE/DELETE.
- Semua query menggunakan parameterized query.
- Polling mode (tidak perlu webhook/server HTTP).
