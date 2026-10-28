# Clash Dashboard

Perkenalkan ini adalah Repostory untuk mendata setiap anggota agar pemimpin mudah dalam melihat statistik pemain 


cara penggunaan
1. Fork Repostory ini
2. Pergi ke Setting => Secret "Tambahkan CLAN_TAG Isi dengan Tag Clan mu
3.Pergi ke Setting => Secret "Tambahkan COC_API_TOKEN Gunakan Api token milikmu
4. 

## Data live lewat Cloudflare Worker (opsional)

Secara default dashboard membaca file JSON di `data/` (diisi GitHub Actions). Dengan Worker,
data war, raid, CWL dan clan bisa diambil **langsung dari API Clash of Clans** tanpa menunggu
cron. Token tetap aman karena hanya disimpan di Worker. Riwayat tetap dari JSON, dan kalau
Worker mati dashboard otomatis kembali ke JSON.

1. `cd worker && npx wrangler login`
2. Edit `worker/wrangler.toml`, isi `ALLOWED_ORIGINS` dengan alamat web Anda.
3. `npx wrangler secret put COC_API_TOKEN` lalu `npx wrangler secret put CLAN_TAG`
4. `npx wrangler deploy` (akan menampilkan alamat `https://balado-coc-proxy.<akun>.workers.dev`)
5. Isi alamat itu ke `LIVE_API_URL` di `js/api.js`, commit, push.

Cek cepat: buka `<alamat-worker>/health` lalu `<alamat-worker>/currentwar`.

Catatan: token CoC harus didaftarkan untuk IP proxy RoyaleAPI (`45.79.218.79`), sama seperti
yang dipakai scraper sekarang.
