// Mengirim antrean notifikasi dari Admin (sheet "PushQueue") ke semua perangkat di "PushSubscriptions".
// Dijalankan oleh .github/workflows/push-broadcast.yml
// Hasil kirim per perangkat dicatat ke sheet "Log Penerima" (action pushLogRecipients).

const crypto = require('crypto');
const webpush = require('web-push');

const { GAS_URL, PUSH_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;

function fail(msg) {
  console.error('ERROR: ' + msg);
  process.exit(1);
}

if (!GAS_URL || !PUSH_SECRET || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  fail('Secret belum lengkap. Isi PUSH_SECRET dan VAPID_PRIVATE_KEY di Settings > Secrets and variables > Actions.');
}

// Pastikan kunci privat benar-benar pasangan dari kunci publik yang dipakai situs.
function toB64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
try {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(VAPID_PRIVATE_KEY.trim(), 'base64url'));
  if (toB64Url(ecdh.getPublicKey()) !== VAPID_PUBLIC_KEY.trim()) {
    fail('VAPID_PRIVATE_KEY tidak cocok dengan kunci publik di index.html. Pakai kunci privat pasangan yang benar.');
  }
} catch (e) {
  fail('VAPID_PRIVATE_KEY tidak valid: ' + e.message);
}

webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:famuhacoffee@gmail.com', VAPID_PUBLIC_KEY.trim(), VAPID_PRIVATE_KEY.trim());

async function gasGet(params) {
  const res = await fetch(GAS_URL + '?' + new URLSearchParams(params));
  return res.json();
}
async function gasPost(payload) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ secret: PUSH_SECRET }, payload)),
    redirect: 'follow'
  });
  return res.json();
}

async function main() {
  const pending = await gasGet({ action: 'pushQueuePending', secret: PUSH_SECRET });
  if (!pending.ok) fail('Gagal membaca antrean: ' + (pending.error || 'tidak diketahui') + ' (cek PUSH_SECRET dan deploy Apps Script terbaru)');
  if (!pending.items.length) { console.log('Tidak ada antrean.'); return; }

  const subRes = await gasGet({ action: 'pushListSubscribers', secret: PUSH_SECRET });
  if (!subRes.ok) fail('Gagal membaca daftar subscriber: ' + (subRes.error || 'tidak diketahui'));
  const seen = new Set();
  const subs = subRes.subscribers.filter((s) => {
    if (!s.endpoint || !s.keys || !s.keys.p256dh || !s.keys.auth || seen.has(s.endpoint)) return false;
    seen.add(s.endpoint);
    return true;
  });
  console.log('Antrean: ' + pending.items.length + ', perangkat: ' + subs.length);

  for (const item of pending.items) {
    const claim = await gasPost({ action: 'pushQueueClaim', id: item.id });
    if (!claim.ok) { console.log('Dilewati (sudah diproses):', item.id); continue; }

    const payload = JSON.stringify({
      title: item.title, body: item.body, url: item.url,
      icon: '/icon-192.png', tag: 'famuha-' + item.id
    });
    let sent = 0, failed = 0;
    const dead = [];
    const rejected = [];
    const results = []; // hasil per perangkat, untuk sheet "Log Penerima"

    for (let i = 0; i < subs.length; i += 10) {
      await Promise.all(subs.slice(i, i + 10).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: String(s.keys.p256dh), auth: String(s.keys.auth) } },
            payload,
            { TTL: 86400, urgency: 'normal' }
          );
          sent++;
          results.push({ endpoint: s.endpoint, ok: true });
        } catch (err) {
          failed++;
          const detail = (err.body || err.message || '').toString().slice(0, 120);
          results.push({
            endpoint: s.endpoint,
            ok: false,
            error: ((err.statusCode || '') + ' ' + detail).trim().slice(0, 150)
          });
          if (err.statusCode === 404 || err.statusCode === 410) dead.push(s.endpoint);
          else if (err.statusCode === 401 || err.statusCode === 403 || /VapidPkHashMismatch/.test(String(err.body || ''))) rejected.push(s.endpoint);
          else console.log('Gagal kirim:', err.statusCode || '', detail);
        }
      }));
    }

    // Catat siapa saja yang menerima / gagal. HARUS sebelum langganan mati dihapus,
    // supaya nama, No HP, dan perangkatnya masih bisa dicari di PushSubscriptions.
    // Kalau pencatatan gagal, pengiriman tetap dianggap selesai.
    try {
      for (let i = 0; i < results.length; i += 200) {
        const logRes = await gasPost({ action: 'pushLogRecipients', id: item.id, results: results.slice(i, i + 200) });
        if (!logRes.ok) console.log('Log Penerima gagal dicatat:', logRes.error || 'tidak diketahui');
      }
    } catch (e) {
      console.log('Log Penerima gagal dicatat:', e.message);
    }

    // 401/403 atau 400 VapidPkHashMismatch (Apple) = langganan dibuat dengan kunci VAPID lain (lama). Hanya dibuang kalau ada yang berhasil terkirim,
    // supaya salah pengaturan kunci tidak menghapus semua langganan.
    if (sent > 0) rejected.forEach((ep) => dead.push(ep));
    for (const endpoint of dead) await gasPost({ action: 'pushRemoveEndpoint', endpoint });
    await gasPost({ action: 'pushQueueMarkSent', id: item.id, sent, failed });
    console.log('Selesai ' + item.id + ': berhasil ' + sent + ', gagal ' + failed + ', langganan mati dibersihkan ' + dead.length);
  }
}

main().catch((e) => fail(e.message));
