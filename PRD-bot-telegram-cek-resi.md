# PRD: Bot Telegram Cek Resi Retur Paket

## 1. Ringkasan

Bot Telegram sederhana dan ringan berbasis Node.js. User mengirim nomor resi ke bot, bot melakukan query ke database PostgreSQL pada tabel `return_package_receipts` beserta relasinya, lalu membalas dengan detail informasi resi. Jika data tidak ditemukan, bot membalas dengan pesan kosong/tidak ditemukan.

Bot didesain modular agar mudah dikembangkan di kemudian hari (menambah command baru, menambah relasi, menambah sumber data lain), namun scope v1 hanya fitur cek resi.

## 2. Tujuan

- User dapat mengecek status/detail paket retur hanya dengan mengirim nomor resi ke chat Telegram.
- Bot membaca langsung dari database `simplecmpos_db` (PostgreSQL), tabel `return_package_receipts`.
- Codebase ringan (minim dependency), mudah di-maintain dan diperluas.

## 3. Scope

### In Scope (v1)
- Bot Telegram menerima pesan teks yang berisi nomor resi.
- Query ke tabel `return_package_receipts` + relasi terkait (lihat Task 0 — Discovery Skema).
- Format balasan detail resi ke user.
- Balasan kosong/pesan "tidak ditemukan" jika resi tidak ada di database.
- Koneksi database via environment variable (`.env`).

### Out of Scope (v1, boleh direncanakan untuk struktur tapi tidak diimplementasi sekarang)
- Command tambahan selain kirim nomor resi (misal `/start`, `/help` boleh ada minimal saja).
- Autentikasi/otorisasi user Telegram.
- Notifikasi otomatis / push update status resi.
- Multi-bahasa.
- Fitur tulis/update data ke database (bot bersifat **read-only**).

## 4. Kredensial & Environment

Gunakan file `.env` (jangan hardcode kredensial di kode):

```dotenv
DB_CONNECTION=pgsql
DB_HOST=postgres-global
DB_PORT=5432
DB_DATABASE=simplecmpos_db
DB_USERNAME=postgres
DB_PASSWORD=postgres

TELEGRAM_BOT_TOKEN=<isi_dengan_token_bot_dari_BotFather>
```

Catatan:
- `DB_HOST=postgres-global` mengasumsikan aplikasi berjalan dalam Docker network yang sama (network `laravel`, sama seperti stack existing). Jika project dijalankan lokal di luar Docker, `DB_HOST` perlu diganti sesuai environment (misal `localhost` + port yang di-expose).
- Sertakan `.env.example` di repo (tanpa value sensitif) dan pastikan `.env` masuk `.gitignore`.

## 5. Tech Stack (ringan, sesuai kebutuhan)

- **Runtime**: Node.js (LTS terbaru, minimal v18).
- **Telegram library**: [`node-telegram-bot-api`](https://www.npmjs.com/package/node-telegram-bot-api) — ringan, polling mode (tidak perlu setup webhook/server HTTP untuk v1).
- **Database client**: [`pg`](https://www.npmjs.com/package/pg) — native PostgreSQL driver, tanpa ORM berat. Query ditulis manual (parameterized query) agar tetap ringan dan eksplisit.
- **Env loader**: `dotenv`.
- **Tidak menggunakan** ORM besar (Prisma/TypeORM/Sequelize) di v1 — cukup `pg` + query manual, supaya startup ringan dan gampang dibaca. Kalau di masa depan kompleksitas relasi bertambah banyak, bisa dipertimbangkan migrasi ke query builder (misal `knex`).

## 6. Task 0 — Discovery Skema Database (WAJIB dilakukan sebelum coding fitur)

Agent koding **harus** menjalankan langkah ini terlebih dahulu untuk memastikan nama kolom & relasi yang benar, karena skema pasti tabel `return_package_receipts` belum diketahui di PRD ini.

Langkah:
1. Koneksi ke database menggunakan kredensial di atas.
2. Jalankan query berikut untuk melihat struktur tabel utama:
   ```sql
   \d return_package_receipts
   ```
   atau via SQL murni:
   ```sql
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'return_package_receipts'
   ORDER BY ordinal_position;
   ```
3. Temukan kolom yang menyimpan **nomor resi** (kemungkinan nama seperti `resi_number`, `receipt_number`, `tracking_number`, `no_resi`, atau semacamnya) — sesuaikan dengan hasil aktual.
4. Temukan foreign key / relasi dari tabel ini ke tabel lain untuk mengetahui "relasinya":
   ```sql
   SELECT
       tc.constraint_name, kcu.column_name,
       ccu.table_name AS foreign_table_name,
       ccu.column_name AS foreign_column_name
   FROM information_schema.table_constraints AS tc
   JOIN information_schema.key_column_usage AS kcu
       ON tc.constraint_name = kcu.constraint_name
   JOIN information_schema.constraint_column_usage AS ccu
       ON ccu.constraint_name = tc.constraint_name
   WHERE tc.table_name = 'return_package_receipts'
     AND tc.constraint_type = 'FOREIGN KEY';
   ```
5. Cek juga tabel lain yang punya foreign key **mengarah ke** `return_package_receipts` (relasi one-to-many dari sisi lain):
   ```sql
   SELECT
       tc.table_name, kcu.column_name,
       ccu.table_name AS foreign_table_name,
       ccu.column_name AS foreign_column_name
   FROM information_schema.table_constraints AS tc
   JOIN information_schema.key_column_usage AS kcu
       ON tc.constraint_name = kcu.constraint_name
   JOIN information_schema.constraint_column_usage AS ccu
       ON ccu.constraint_name = tc.constraint_name
   WHERE tc.constraint_type = 'FOREIGN KEY'
     AND ccu.table_name = 'return_package_receipts';
   ```
6. Dokumentasikan hasil temuan (nama kolom resi, daftar tabel relasi, nama kolom yang relevan untuk ditampilkan) di file `docs/schema-notes.md` di dalam project sebagai referensi lanjutan.
7. Gunakan hasil discovery ini untuk menyusun query JOIN final pada Task 3.

> Jika kolom nomor resi ternyata tidak ada langsung di `return_package_receipts` melainkan di tabel relasi, sesuaikan alur pencarian: cari dulu di tabel relasi berdasarkan nomor resi, lalu JOIN balik ke `return_package_receipts`.

## 7. Struktur Folder Project

```
telegrambotpos/
├── src/
│   ├── index.js                # entry point, inisialisasi bot & db
│   ├── config/
│   │   └── env.js              # load & validasi environment variables
│   ├── db/
│   │   └── pool.js             # koneksi pg Pool
│   ├── services/
│   │   └── receiptService.js   # logic query resi + relasi
│   ├── bot/
│   │   ├── handlers.js         # handler pesan masuk (nomor resi)
│   │   └── formatter.js        # format hasil query jadi teks balasan Telegram
│   └── utils/
│       └── logger.js           # simple logger (console-based, boleh pakai pino kalau perlu)
├── docs/
│   └── schema-notes.md         # hasil discovery skema (dari Task 0)
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

Struktur ini sengaja dipisah per tanggung jawab (`bot`, `db`, `services`) supaya pengembangan fitur baru di masa depan (command baru, sumber data baru) tinggal menambah file, tanpa mengubah struktur inti — sesuai requirement "bisa dikembangkan di kemudian hari".

## 8. Task 1 — Setup Project

- Inisialisasi `package.json`, install dependency: `node-telegram-bot-api`, `pg`, `dotenv`.
- Buat `.env.example` dan `.gitignore` (harus mengandung `.env`, `node_modules`).
- Buat `src/config/env.js` yang membaca env var dan **melempar error saat startup** jika ada variabel wajib yang kosong (`TELEGRAM_BOT_TOKEN`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`).

## 9. Task 2 — Koneksi Database

- Buat `src/db/pool.js` yang mengekspor instance `pg.Pool` menggunakan env var di atas.
- Pool dibuat sekali (singleton), di-reuse di seluruh aplikasi (jangan buka koneksi baru per request).
- Tambahkan basic error handling: jika koneksi gagal saat startup, log error yang jelas dan exit process (`process.exit(1)`), supaya masalah koneksi db langsung ketahuan, bukan silent fail.

## 10. Task 3 — Service Query Resi

Buat `src/services/receiptService.js` dengan fungsi:

```js
async function getReceiptDetailByResi(resiNumber) {
  // return object detail resi + relasi, atau null jika tidak ditemukan
}
```

Ketentuan:
- Gunakan **parameterized query** (`$1`, `$2`, dst) — **jangan** melakukan string concatenation ke SQL (hindari SQL injection).
- Query harus melakukan JOIN ke tabel-tabel relasi yang ditemukan pada Task 0, agar informasi yang dikembalikan lengkap (misal: data pengirim, penerima, status retur, item paket — sesuaikan dengan hasil discovery aktual).
- Lakukan pencarian case-insensitive & trim whitespace pada input nomor resi (contoh: `WHERE UPPER(TRIM(resi_column)) = UPPER(TRIM($1))`) supaya user tidak perlu mengetik persis sama.
- Jika tidak ada baris hasil query → return `null`.
- Jika ada relasi one-to-many (misal satu resi punya banyak item), gabungkan dengan query terpisah atau `json_agg` dalam satu query, sesuai mana yang lebih sesuai dengan skema aktual.

## 11. Task 4 — Formatter Pesan

Buat `src/bot/formatter.js` dengan fungsi:

```js
function formatReceiptMessage(receiptData) {
  // return string siap kirim ke Telegram (boleh pakai Markdown/HTML formatting Telegram)
}
```

Ketentuan:
- Gunakan format Telegram (`parse_mode: 'HTML'` atau `'Markdown'`) agar rapi, misal nama field di-bold.
- Tampilkan field-field penting hasil discovery (nomor resi, status, tanggal, nama pengirim/penerima, dll — sesuaikan skema aktual). Jangan menampilkan kolom teknis seperti `id`, `created_at`/`updated_at` internal kecuali relevan.
- Jika field tertentu `null`/kosong di database, tampilkan `-` atau `(tidak ada data)`, jangan tampilkan `null`/`undefined` mentah.

## 12. Task 5 — Bot Handler & Alur Pesan

Buat `src/bot/handlers.js`:

**Alur utama:**
1. Bot berjalan dengan **polling mode** (`{ polling: true }`) — cukup untuk v1, tidak perlu server HTTP/webhook.
2. Setiap pesan teks masuk (`bot.on('message', ...)`):
   - Ambil teks pesan, trim whitespace, anggap sebagai kandidat nomor resi.
   - Validasi sederhana: jika teks kosong atau berupa command lain (diawali `/`), tangani terpisah (lihat command di bawah) — jangan dianggap nomor resi.
   - Panggil `receiptService.getReceiptDetailByResi(resiNumber)`.
   - **Jika data ditemukan** → kirim balasan hasil `formatReceiptMessage(data)`.
   - **Jika data tidak ditemukan** → sesuai requirement, kirim **pesan kosong**. Karena Telegram Bot API tidak mengizinkan mengirim pesan dengan teks benar-benar kosong (`sendMessage` akan error jika `text` kosong), implementasikan salah satu dari opsi berikut dan **catat di README pilihan mana yang dipakai**:
     - **Opsi A (direkomendasikan)**: kirim whitespace tunggal (`" "`) sebagai representasi "balasan kosong" — secara teknis valid terkirim dan terlihat kosong di chat.
     - **Opsi B**: tidak mengirim balasan sama sekali (bot diam) jika data tidak ditemukan.
   - Default implementasi: **Opsi A**, karena lebih sesuai dengan requirement "dikembalikan ucapan kosong" (ada balasan, tapi kosong), bukan tidak membalas sama sekali.
   - Bungkus pemanggilan service dengan try/catch. Jika terjadi error (misal db down), log error di server dan kirim pesan generik ke user (misal: `"Terjadi kendala, silakan coba lagi nanti."`) — jangan bocorkan detail error/stack trace ke user.

**Command dasar (minimal, untuk UX):**
- `/start` → kirim pesan singkat penjelasan cara pakai bot (kirim nomor resi langsung).
- (Command lain tidak diimplementasikan di v1, tapi handler ditulis modular agar command baru mudah ditambahkan sebagai fungsi baru di `handlers.js`.)

## 13. Task 6 — Entry Point

`src/index.js`:
- Load env (`config/env.js`).
- Inisialisasi db pool (`db/pool.js`).
- Inisialisasi bot Telegram dengan token dari env.
- Register handlers dari `bot/handlers.js`.
- Log ke console saat bot berhasil start (misal: `"Bot cek resi aktif..."`).
- Tangani `process.on('unhandledRejection', ...)` dan `process.on('uncaughtException', ...)` minimal dengan logging, supaya bot tidak crash diam-diam.

## 14. Non-Functional Requirements

- **Ringan**: total dependency minim (`node-telegram-bot-api`, `pg`, `dotenv` saja untuk v1). Hindari framework web (Express dkk) karena tidak dibutuhkan di v1 (polling mode).
- **Extensible**: struktur folder per-concern (bot/db/services) supaya command atau sumber data baru bisa ditambah tanpa refactor besar.
- **Read-only**: bot tidak boleh melakukan operasi INSERT/UPDATE/DELETE ke database mana pun.
- **Keamanan**: kredensial hanya lewat `.env`, tidak pernah di-hardcode atau ter-commit ke git. Semua query ke database wajib parameterized.
- **Logging**: minimal log request (nomor resi yang dicari, ditemukan/tidak) dan error, ke console — cukup untuk v1, tidak perlu logging service eksternal.

## 15. Acceptance Criteria

- [ ] Bot bisa dijalankan dengan `node src/index.js` (atau `npm start`) menggunakan `.env` yang valid.
- [ ] Mengirim nomor resi yang **ada** di `return_package_receipts` → bot membalas detail lengkap resi beserta data dari tabel relasi.
- [ ] Mengirim nomor resi yang **tidak ada** → bot membalas sesuai Opsi A/B di Task 5 (balasan kosong), tanpa error.
- [ ] Mengirim `/start` → bot membalas instruksi singkat.
- [ ] Mematikan koneksi database lalu mengirim resi → bot tidak crash, membalas pesan generik error ke user, dan mencatat error di log server.
- [ ] Tidak ada kredensial hardcoded di source code (hanya di `.env`).
- [ ] Query menggunakan parameterized query (tidak ada string concatenation SQL langsung dari input user).
- [ ] `docs/schema-notes.md` berisi hasil discovery skema tabel `return_package_receipts` dan relasinya (dari Task 0).

## 16. Cara Menjalankan (untuk dicantumkan di README oleh agent)

```bash
npm install
cp .env.example .env
# isi .env dengan kredensial db + TELEGRAM_BOT_TOKEN
npm start
```

## 17. Pertanyaan Terbuka / Catatan untuk Pengembang Lanjutan

- Nama kolom nomor resi dan struktur relasi pasti baru diketahui setelah Task 0 dijalankan — semua nama kolom di contoh dokumen ini bersifat ilustratif, sesuaikan dengan hasil discovery aktual.
- Jika di kemudian hari dibutuhkan webhook (bukan polling) atau deploy ke server tanpa outbound polling, perlu ditambahkan server HTTP ringan (misal Express) — tidak termasuk scope v1.
- Jika volume relasi/kompleksitas query bertambah signifikan, pertimbangkan migrasi dari raw SQL ke query builder ringan (`knex`) tanpa perlu ORM penuh.
