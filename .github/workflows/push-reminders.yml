/**
 * Famuha Coffee — pengirim Web Push harian.
 * Dijalankan oleh GitHub Actions (lihat push-reminders.yml).
 *
 * Alur:
 *  1. Ambil daftar subscriber dari Google Apps Script (GAS_URL).
 *  2. Untuk tiap subscriber yang wishlist-nya masih kosong,
 *     hitung sudah berapa hari sejak firstVisit.
 *  3. Kalau pas hari 1 / 3 / 7 dan reminder hari itu belum pernah
 *     dikirim, kirim Web Push asli via VAPID.
 *  4. Lapor balik ke GAS supaya hari itu ditandai "sudah dikirim".
 */

const webpush = require('web-push');

const GAS_URL = process.env.GAS_URL;
const PUSH_SECRET = process.env.PUSH_SECRET;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@famuha.example';

const MESSAGES = {
  1: 'Sudah tahu mau minum apa hari ini? ☕',
  3: 'Jangan cuma lihat-lihat 😉',
  7: 'Kopi favorit belum punya tempat? ❤️'
};

function daysSince(isoDate) {
  const then = new Date(isoDate).getTime();
  const diffMs = Date.now() - then;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

async function fetchSubscribers() {
  const url = `${GAS_URL}?action=pushListSubscribers&secret=${encodeURIComponent(PUSH_SECRET)}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!json.ok) throw new Error('Gagal ambil subscriber: ' + (json.error || 'unknown'));
  return json.subscribers;
}

async function markReminderSent(row, day) {
  await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'pushMarkReminderSent', row, day, secret: PUSH_SECRET })
  });
}

async function main() {
  if (!GAS_URL || !PUSH_SECRET || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.error('Env var belum lengkap: GAS_URL, PUSH_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY');
    process.exit(1);
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const subscribers = await fetchSubscribers();
  console.log(`Ditemukan ${subscribers.length} subscriber.`);

  let sent = 0;
  for (const sub of subscribers) {
    if (sub.wishlistFilled) continue;
    if (!sub.firstVisit) continue;

    const d = daysSince(sub.firstVisit);
    for (const dayStr of Object.keys(MESSAGES)) {
      const day = Number(dayStr);
      if (d < day) continue;
      if (sub.remindersSent.includes(String(day))) continue;

      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }
      };
      const payload = JSON.stringify({
        title: 'Famuha Coffee ☕',
        body: MESSAGES[day],
        url: process.env.SITE_URL || '/'
      });

      try {
        await webpush.sendNotification(pushSubscription, payload);
        await markReminderSent(sub.row, day);
        sent++;
        console.log(`Reminder hari ${day} terkirim ke row ${sub.row}`);
      } catch (err) {
        console.warn(`Gagal kirim ke row ${sub.row} (mungkin subscription kadaluarsa):`, err.statusCode || err.message);
        // 404/410 artinya subscription sudah tidak valid lagi — biarkan saja,
        // baris itu otomatis berhenti menerima push berikutnya.
      }

      break; // satu hari reminder per subscriber per run cukup
    }
  }

  console.log(`Selesai. Total reminder terkirim: ${sent}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
