'use strict';
const { PREFIX, HASH, send, redis, requireAuth, clean } = require('../lib/core');

function parseBody(req) {
  let b = req.body;
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch { b = null; }
  }
  return b && typeof b === 'object' ? b : {};
}

module.exports = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;

    // READ — daftar semua barang
    if (req.method === 'GET') {
      const [vals] = await redis([['HVALS', HASH]]);
      const items = (vals || []).map((v) => { try { return JSON.parse(v); } catch { return null; } }).filter(Boolean);
      return send(res, 200, { items });
    }

    // CREATE — nomor urut per tahun, otomatis berlanjut; 1 unit = 1 kode (-1, -2, ...)
    if (req.method === 'POST') {
      const body = parseBody(req);
      const jumlah = body.jumlah == null || body.jumlah === '' ? 1 : Number(body.jumlah);
      if (!Number.isInteger(jumlah) || jumlah < 1 || jumlah > 200) {
        return send(res, 400, { error: 'Jumlah unit harus 1–200' });
      }
      const { data, error } = clean(body);
      if (error) return send(res, 400, { error });

      const yy = data.tanggal.slice(2, 4); // tahun dari tanggal input
      const [seq] = await redis([['INCR', 'inv:seq:' + yy]]);
      const no = String(seq).padStart(4, '0');
      const now = new Date().toISOString();

      const args = ['HSET', HASH];
      const created = [];
      for (let u = 1; u <= jumlah; u++) {
        const kode = `${PREFIX}/${yy}/${no}-${u}`;
        const rec = { kode, ...data, tahun: yy, no: seq, unit: u, dibuat: now, diubah: now };
        args.push(kode, JSON.stringify(rec));
        created.push(rec);
      }
      await redis([args]);
      return send(res, 201, { items: created });
    }

    const kode = String((req.query && req.query.kode) || '');
    if (!kode) return send(res, 400, { error: 'Parameter kode wajib diisi' });

    // UPDATE — kode & tanggal input tidak berubah
    if (req.method === 'PUT') {
      const [cur] = await redis([['HGET', HASH, kode]]);
      if (!cur) return send(res, 404, { error: 'Barang tidak ditemukan' });
      const old = JSON.parse(cur);
      const { data, error } = clean({ ...parseBody(req), tanggal: old.tanggal });
      if (error) return send(res, 400, { error });
      const rec = {
        ...old, ...data,
        kode: old.kode, tahun: old.tahun, no: old.no, unit: old.unit, tanggal: old.tanggal,
        diubah: new Date().toISOString(),
      };
      await redis([['HSET', HASH, kode, JSON.stringify(rec)]]);
      return send(res, 200, { item: rec });
    }

    // DELETE
    if (req.method === 'DELETE') {
      const [n] = await redis([['HDEL', HASH, kode]]);
      if (!n) return send(res, 404, { error: 'Barang tidak ditemukan' });
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: 'Method tidak diizinkan' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: e.message || 'Kesalahan server' });
  }
};
