'use strict';
const crypto = require('crypto');

// ---- Konfigurasi (bisa diubah lewat Environment Variables di Vercel) ----
const PREFIX = (process.env.KODE_PREFIX || 'BTG/INV').trim().replace(/\/+$/, '');
const SCHOOL = process.env.SCHOOL_NAME || 'UPT SDN 130 Benteng';
const KONDISI = ['Baik', 'Rusak Ringan', 'Rusak Berat'];
const HASH = 'inv:items';
const SEQ = 'inv:seq:all'; // satu penghitung untuk semua tahun

function send(res, code, obj) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(code).json(obj);
}

// ---- Upstash Redis (REST, tanpa dependensi) ----
async function redis(cmds) {
  const base = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
  if (!base || !token) throw new Error('Database belum dikonfigurasi (env Upstash Redis kosong)');
  const r = await fetch(base + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('Database error ' + r.status);
  const out = await r.json();
  return out.map((o) => {
    if (o && o.error) throw new Error('Database: ' + o.error);
    return o.result;
  });
}

// ---- Autentikasi: token bertanda tangan HMAC ----
function secret() {
  return process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || '';
}
function hmac(body) {
  return crypto.createHmac('sha256', secret()).update(body).digest('base64url');
}
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + hmac(body);
}
function verify(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(hmac(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}
function requireAuth(req, res) {
  if (!secret()) {
    send(res, 500, { error: 'ADMIN_PASSWORD belum diatur di Environment Variables Vercel' });
    return false;
  }
  const h = req.headers.authorization || '';
  if (!verify(h.startsWith('Bearer ') ? h.slice(7) : '')) {
    send(res, 401, { error: 'Sesi berakhir, silakan masuk lagi' });
    return false;
  }
  return true;
}

// ---- Validasi input ----
function str(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}
function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (isNaN(d) || d.toISOString().slice(0, 10) !== s) return false;
  const y = Number(s.slice(0, 4));
  return y >= 2024 && y <= 2099; // tahun paling lama 2024
}
function clean(b) {
  const nama = str(b.nama, 120);
  if (!nama) return { error: 'Nama barang wajib diisi' };

  const tanggal = str(b.tanggal, 10);
  if (!validDate(tanggal)) return { error: 'Tanggal input tidak valid (minimal tahun 2024)' };

  const kondisi = b.kondisi == null || b.kondisi === '' ? 'Baik' : b.kondisi;
  if (!KONDISI.includes(kondisi)) return { error: 'Kondisi tidak valid' };

  const harga = b.harga == null || b.harga === '' ? 0 : Number(b.harga);
  if (!Number.isFinite(harga) || harga < 0 || harga > 1e12) return { error: 'Harga tidak valid' };

  return {
    data: {
      nama,
      kategori: str(b.kategori, 60) || 'Lainnya',
      merek: str(b.merek, 120),
      sumber: str(b.sumber, 60),
      harga: Math.round(harga),
      kondisi,
      lokasi: str(b.lokasi, 80),
      tanggal,
      keterangan: str(b.keterangan, 300),
    },
  };
}

module.exports = { PREFIX, SCHOOL, KONDISI, HASH, SEQ, send, redis, sign, verify, requireAuth, clean };
