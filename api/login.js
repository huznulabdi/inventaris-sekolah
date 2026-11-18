'use strict';
const crypto = require('crypto');
const { send, redis, sign } = require('../lib/core');

const SESSION_MS = 12 * 60 * 60 * 1000; // 12 jam
const MAX_TRY = 10; // percobaan gagal per IP per 15 menit

function sha(s) {
  return crypto.createHash('sha256').update(String(s)).digest();
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method tidak diizinkan' });
    const admin = process.env.ADMIN_PASSWORD;
    if (!admin) return send(res, 500, { error: 'ADMIN_PASSWORD belum diatur di Environment Variables Vercel' });

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const password = body && typeof body.password === 'string' ? body.password : '';

    const ip = String(req.headers['x-forwarded-for'] || 'x').split(',')[0].trim();
    const key = 'inv:login:' + ip;
    const [tries] = await redis([['INCR', key], ['EXPIRE', key, 900]]);
    if (tries > MAX_TRY) return send(res, 429, { error: 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.' });

    if (!crypto.timingSafeEqual(sha(password), sha(admin))) {
      return send(res, 401, { error: 'Kata sandi salah' });
    }
    await redis([['DEL', key]]);
    return send(res, 200, { token: sign({ exp: Date.now() + SESSION_MS }) });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: e.message || 'Kesalahan server' });
  }
};
