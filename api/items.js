'use strict';
const { PREFIX, HASH, SEQ, send, redis, requireAuth, clean } = require('../lib/core');

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

    // CREATE — nomor urut berlanjut lintas tahun (tidak reset); 1 unit = 1 kode (-1, -2, ...)
    if (req.method === 'POST') {
      const body = parseBody(req);
      const jumlah = body.jumlah == null || body.jumlah === '' ? 1 : Number(body.jumlah);
      if (!Number.isInteger(jumlah) || jumlah < 1 || jumlah > 200) {
        return send(res, 400, { error: 'Jumlah unit harus 1–200' });
      }
      const { data, error } = clean(body);
      if (error) return send(res, 400, { error });

      const yy = data.tanggal.slice(2, 4); // tahun dari tanggal input

      // Penghitung tunggal lintas tahun. Pertama kali dipakai, mulai dari nomor
      // terbesar yang sudah ada agar tidak bentrok dengan data lama.
      const [cur] = await redis([['GET', SEQ]]);
      if (cur == null) {
        const [vals] = await redis([['HVALS', HASH]]);
        let max = 0;
        for (const v of vals || []) {
          try { max = Math.max(max, Number(JSON.parse(v).no) || 0); } catch {}
        }
        await redis([['SETNX', SEQ, String(max)]]);
      }
      const [seq] = await redis([['INCR', SEQ]]);
      const no = String(seq).padStart(3, '0'); // 001, 002, ... 1000 dst.
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
