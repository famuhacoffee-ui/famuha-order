# Famuha Coffee — Web Push Notification Setup

Paket ini nambahin **notifikasi push beneran** (jalan walau browser/tab
ditutup) ke situs Famuha kamu di GitHub Pages, plus reminder otomatis
kalau Wishlist (racikan yang mau dipesan) masih kosong.

## Kenapa perlu GitHub Actions?

GitHub Pages itu situs statis — tidak ada server yang bisa "membangunkan"
browser orang untuk kirim notifikasi kapan pun kita mau. Web Push asli
butuh server yang menyimpan langganan (subscription) dan mengirim push
di waktu yang tepat. Karena kamu sudah pakai **Google Apps Script**
sebagai backend ringan, paket ini menambah dua bagian:

1. **GAS** → tempat menyimpan siapa saja yang berlangganan notifikasi.
2. **GitHub Actions (cron harian, gratis)** → yang benar-benar mengirim
   push di hari ke-1, ke-3, ke-7 pakai library `web-push`.

## Isi paket

| File | Taruh di | Fungsi |
|---|---|---|
| `sw.js` | root repo (sejajar `index.html`) | Terima push, buka tab saat notifikasi diklik |
| `push-client-snippet.html` | tempel isinya sebelum `</body>` di `index.html` | Prompt izin halus, subscribe, deteksi Wishlist kosong |
| `gas-push-backend.gs` | gabung ke Apps Script (Code.gs) yang sudah ada | Simpan subscription & status Wishlist |
| `send-push-reminders.js` | root repo | Script Node yang benar-benar kirim push |
| `push-reminders.yml` | `.github/workflows/push-reminders.yml` | Jadwal harian (cron) buat jalanin script di atas |

## Ikon notifikasi
- `icon-192.png` — ikon utama (dipakai di notifikasi & manifest)
- `icon-512.png` — versi lebih besar (opsional, buat "Add to Home Screen")
- `icon-192-maskable.png` — versi dengan padding aman buat Android adaptive icon (opsional)
- `badge-72.png` — ikon monokrom kecil buat status bar Android

Upload keempatnya ke **root repo**, sejajar `sw.js` dan `index.html`.
`sw.js` sudah otomatis mereferensikan `/icon-192.png` dan `/badge-72.png`.

## Langkah setup

### 1. VAPID key (sudah digenerate, tinggal pakai)
```
Public key : BDCCwgMZwl5gDx0kVoZraSNdlChIdaK9JjxS724cLM7h6b2FLoNdMBHQts8g24Aj8FUk9ku6gE4bb6f6uSzvRMQ
Private key: OJDJxHE-LKdMGQcUDFUBHMbqvkHMM8SCsFhPtKI-Ztw
```
⚠️ **Private key JANGAN dimasukkan ke index.html atau file publik apa pun.**
Ia hanya dipakai di GitHub Actions (lewat Secrets, langkah 4).

Kalau mau generate ulang sendiri: `npx web-push generate-vapid-keys`.

### 2. Pasang di GitHub Pages
- Upload `sw.js` ke root repo.
- Tempel isi `push-client-snippet.html` sebelum `</body>` di `index.html`,
  lalu isi `VAPID_PUBLIC_KEY` (sudah terisi otomatis di file ini) dan
  pastikan `GAS_URL` di situ mengarah ke Apps Script kamu yang sekarang.

### 3. Pasang backend di Google Apps Script
- Buka project Apps Script yang jadi backend `GAS_URL` kamu sekarang.
- Tempel isi `gas-push-backend.gs`.
- Gabungkan action `pushSubscribe`, `pushMarkWishlist`,
  `pushMarkReminderSent` ke `doPost(e)` yang sudah ada, dan
  `pushListSubscribers` ke `doGet(e)` yang sudah ada (contoh
  penggabungan ada di bagian bawah file itu).
- Ganti `PUSH_SECRET` dengan string rahasia buatanmu sendiri
  (dipakai supaya orang lain tidak bisa mengambil daftar subscriber).
- Deploy ulang Apps Script sebagai Web App (biar action baru aktif).
- Bikin sheet baru bernama **PushSubscriptions** di Google Sheet yang
  sama, header di baris 1:
  `phone | endpoint | keys_p256dh | keys_auth | firstVisit | wishlistFilled | remindersSent | updatedAt`
  (kalau kamu tidak bikin manual, sheet ini otomatis dibuat saat
  subscription pertama masuk.)

### 4. Pasang GitHub Action (pengirim push harian)
- Taruh `send-push-reminders.js` di root repo.
- Taruh `push-reminders.yml` di `.github/workflows/push-reminders.yml`.
- Di repo GitHub → **Settings → Secrets and variables → Actions**,
  tambahkan secrets:
  - `GAS_URL` — URL Apps Script kamu (yang sama dengan di index.html)
  - `PUSH_SECRET` — sama persis dengan `PUSH_SECRET` di gas-push-backend.gs
  - `VAPID_PUBLIC_KEY` — key di atas
  - `VAPID_PRIVATE_KEY` — key di atas
- Edit `SITE_URL` di `push-reminders.yml` supaya sesuai alamat GitHub
  Pages kamu.
- Cron-nya jalan tiap hari jam 09:00 WIB. Bisa juga dites manual lewat
  tab **Actions → Famuha Push Reminders → Run workflow**.

## Soal "Wishlist"

Situs kamu saat ini belum punya fitur "Wishlist" tersendiri, jadi paket
ini memakai proksi yang masuk akal: **Wishlist dianggap "terisi" begitu
pengunjung pernah menekan tombol "+ Tambah ke Pesanan" / "+ Tambah ke
Keranjang"** — itu tandanya mereka sudah pilih racikan. Begitu itu
terjadi, reminder otomatis berhenti untuk nomor HP itu.

Kalau maksud "Wishlist" kamu beda (misalnya fitur simpan racikan
favorit yang belum ada di situs), kasih tahu aku — logikanya gampang
disesuaikan tanpa bongkar bagian lain.

## Uji coba cepat
1. Buka situs di HP/laptop, tunggu 4 detik → muncul banner minta izin.
2. Klik "Boleh" → cek console, harus ada permintaan subscribe berhasil
   (dan baris baru muncul di sheet **PushSubscriptions**).
3. Jalankan workflow secara manual (Actions → Run workflow) untuk tes
   pengiriman tanpa nunggu jadwal cron / nunggu 1 hari.
