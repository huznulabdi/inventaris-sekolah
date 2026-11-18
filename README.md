# Inventaris Barang Sekolah

Web pencatatan inventaris (tambah, lihat, ubah, hapus) untuk dipasang di Vercel. Data disimpan di Upstash Redis, akses dilindungi kata sandi admin.

## Format kode barang

`BTG/INV/24/001-1`

| Bagian | Arti |
|---|---|
| `BTG/INV` | Awalan tetap (ubah lewat env `KODE_PREFIX`) |
| `24` | 2 digit tahun dari **tanggal input** (paling lama 2024) |
| `001` | Nomor urut **berlanjut lintas tahun** (tidak reset). Contoh: `24/001`, `24/002`, `25/003`, `26/004` |
| `-1` | Nomor unit. Input "Jumlah unit" 5 → `-1` sampai `-5` |

Kode dan tanggal input tidak bisa diubah setelah disimpan. Nomor yang sudah dihapus tidak dipakai ulang.

## Pasang di Vercel

1. Unggah folder ini ke repository GitHub.
2. Di Vercel: **Add New → Project** → pilih repository → **Deploy** (tanpa pengaturan build).
3. Buat database Redis: di proyek Vercel buka **Storage** → tambahkan **Upstash Redis** (Marketplace) dan sambungkan ke proyek. Atau buat gratis di console.upstash.com lalu isi manual `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN`. Kode juga membaca `KV_REST_API_URL` / `KV_REST_API_TOKEN` bila itu yang dibuat Vercel.
4. Di **Settings → Environment Variables** tambahkan:

   | Nama | Isi |
   |---|---|
   | `ADMIN_PASSWORD` | Kata sandi untuk masuk (wajib) |
   | `AUTH_SECRET` | Teks acak panjang untuk menandatangani sesi (disarankan) |
   | `SCHOOL_NAME` | Nama sekolah di header (opsional, bawaan: UPT SDN 130 Benteng) |
   | `KODE_PREFIX` | Awalan kode (opsional, bawaan: `BTG/INV`) |

5. **Redeploy** agar variabel terbaca. Buka alamat `*.vercel.app` dan masuk dengan `ADMIN_PASSWORD`.

Lewat CLI: `npm i -g vercel`, lalu `vercel` di folder ini.

## Struktur

```
public/index.html   tampilan
api/items.js        GET / POST / PUT / DELETE barang
api/login.js        login (maks 10 percobaan gagal per IP per 15 menit)
api/config.js       nama sekolah & awalan kode
lib/core.js         Redis, token sesi, validasi
```

## Catatan

- Sesi login berlaku 12 jam. Semua endpoint data butuh login.
- Ekspor CSV memakai pemisah `;` agar langsung rapi di Excel berlokal Indonesia.
- Cadangan data: gunakan Ekspor CSV secara berkala.
