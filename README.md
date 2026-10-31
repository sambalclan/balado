# Sambal Balado — Clash of Clans Dashboard

Dashboard statistik untuk clan **Sambal Balado** (`#2RVRP900V`) yang menggunakan **Cloudflare Workers**, **Cloudflare D1**, dan **Clash of Clans API**.

Proyek ini membantu menampilkan data clan, perang, Clan War League (CWL), dan Raid Weekend, termasuk riwayat yang dikumpulkan secara berkala.

> **Kredit AI:** Kode dan pengembangan proyek ini dibuat dengan bantuan **Claude (Anthropic)**, **Gemini (Google)**, dan **ChatGPT (OpenAI)**. Hasil dari AI ditinjau, disesuaikan, dan diintegrasikan untuk kebutuhan proyek ini. Proyek ini bukan produk resmi dari penyedia AI tersebut maupun Supercell.

## Fitur

- Informasi clan dan anggota.
- Status **Current War** dan arsip perang.
- Statistik **Raid Weekend** dan riwayat Raid.
- Data **Clan War League (CWL)** dan riwayatnya.
- Penyimpanan data di **Cloudflare D1**.
- Pembaruan otomatis melalui **Cron Triggers**.
- API berbasis JSON yang dapat digunakan oleh frontend.
- Perlindungan data anggota Raid lama ketika respons API berikutnya tidak lagi menyertakan `members[]`.

> **Catatan:** Data historis hanya tersedia sejauh pernah berhasil dikumpulkan. Perlindungan data tidak dapat mengembalikan detail anggota yang sudah hilang sebelum fitur perlindungan diterapkan.

## Teknologi

- JavaScript
- Cloudflare Workers
- Cloudflare D1 (SQLite)
- Clash of Clans API (melalui proxy RoyaleAPI yang dikonfigurasi di Worker)
- HTML/CSS/JavaScript untuk tampilan dashboard, jika disertakan dalam repository

## 1. Fork Repository

1. Buka halaman repository GitHub proyek ini.
2. Tekan tombol **Fork** di bagian kanan atas.
3. Pilih akun GitHub tujuan.
4. Klik **Create fork**.
5. Setelah selesai, buka repository hasil fork milikmu.

Jika ingin mengunduh kode ke perangkat yang sudah memiliki Git:

```bash
git clone https://github.com/USERNAME/NAMA-REPO.git
cd NAMA-REPO
```

Ganti `USERNAME` dan `NAMA-REPO` sesuai alamat repository hasil fork.

## 2. Persiapan

Siapkan:

- Akun GitHub.
- Akun Cloudflare.
- Token Clash of Clans API yang valid.
- Repository hasil fork yang sudah berisi file proyek, termasuk `worker.js`.

**Jangan pernah memasukkan token API ke dalam repository publik.** Simpan token sebagai secret Cloudflare Worker.

## 3. Buat Database Cloudflare D1

1. Masuk ke dashboard Cloudflare.
2. Buka **Workers & Pages → D1** (nama menu dapat berubah).
3. Buat database baru, misalnya `balado-archive`.
4. Catat database yang dibuat untuk dihubungkan ke Worker.

Kode Worker akan membuat tabel `latest` dan `history` jika belum ada, ketika dijalankan dengan binding D1 yang benar.

## 4. Instalasi Cloudflare Worker

### Melalui dashboard Cloudflare

1. Buka **Workers & Pages**.
2. Buat Worker baru atau buka Worker yang sudah ada.
3. Gunakan file `worker.js` yang sudah tersedia di repository. Tidak perlu membuat file baru. Jika deploy melalui dashboard, gunakan kode dari file tersebut.
4. Tambahkan **D1 binding** dengan nama variabel **`DB`**, lalu pilih database yang dibuat pada langkah sebelumnya.
5. Tambahkan **Secret** bernama **`COC_API_TOKEN`** dan isi dengan token API milikmu.
6. Sesuaikan konstanta `TAG` di `worker.js` dengan tag clan yang ingin dipantau.
7. Deploy Worker.
8. Atur **Cron Trigger** untuk pembaruan berkala, misalnya setiap 15 menit (`*/15 * * * *`).

> Nama menu dan lokasi pengaturan dapat berubah mengikuti pembaruan dashboard Cloudflare.

### Melalui Wrangler (opsional)

Jika repository sudah memiliki konfigurasi Wrangler yang sesuai, kamu bisa melakukan deploy langsung dari folder repository tanpa menambahkan file baru:

```bash
npm install -g wrangler
wrangler login
wrangler secret put COC_API_TOKEN
wrangler deploy
```

Pastikan konfigurasi Wrangler mencantumkan entry point Worker dan binding D1 bernama `DB` yang mengarah ke database milikmu. Perintah di atas bukan pengganti konfigurasi tersebut.

## 5. Konfigurasi

Pada bagian atas `worker.js`, sesuaikan:

```javascript
const BASE = 'https://cocproxy.royaleapi.dev/v1';
const TAG = '#2RVRP900V';
```

- `BASE`: alamat API/proxy yang digunakan Worker.
- `TAG`: tag clan yang ingin dipantau.
- `COC_API_TOKEN`: secret Cloudflare, **bukan** konstanta yang ditulis langsung dalam kode.
- `DB`: nama binding Cloudflare D1 yang digunakan Worker.

Jika menggunakan proxy pihak ketiga, pastikan layanan tersebut masih tersedia dan sesuai dengan kebutuhan akses API-mu.

## 6. Pengujian

Setelah deploy, buka URL Worker milikmu dan periksa endpoint berikut:

| Endpoint | Keterangan |
| --- | --- |
| `/health` | Status Worker, binding D1, dan keberadaan token |
| `/clan` | Data clan terbaru yang tersimpan |
| `/currentwar` | Data perang saat ini |
| `/raid` | Data Raid Weekend terbaru |
| `/cwl` | Data CWL terbaru |
| `/cwl/groups` | Data grup CWL |
| `/war/history` | Riwayat perang |
| `/raid/history` | Riwayat Raid Weekend |
| `/cwl/history` | Riwayat CWL |

Sebagian endpoint juga tersedia dengan awalan `/api/`, misalnya `/api/raid/history`.

**Penting:** Endpoint `/health` hanya memeriksa kondisi dasar; data terbaru akan tersedia setelah proses pengambilan data berhasil berjalan. Worker pada proyek ini menggunakan Cron untuk pembaruan, bukan endpoint refresh publik.

## 7. Memasang Frontend

Gunakan `index.html`, folder `js/`, `pages/`, dan aset lain yang sudah ada di repository. Deploy frontend melalui hosting statis pilihanmu, misalnya GitHub Pages atau Cloudflare Pages. Tidak perlu membuat ulang file-file tersebut.

Pastikan alamat API pada JavaScript frontend mengarah ke URL Worker hasil deploy. Struktur dan cara build frontend bergantung pada file yang tersedia dalam fork masing-masing.

## 8. Pembaruan dari Repository Asli

Untuk mengambil pembaruan melalui Git:

```bash
git remote add upstream https://github.com/sambalclan/balado.git
git fetch upstream
git merge upstream/main
```

Jalankan perintah tersebut dari folder repository hasil fork. Sesuaikan nama branch jika repository menggunakan branch selain `main`. Jika remote `upstream` sudah ada, tidak perlu menambahkannya lagi.

## 9. Catatan Keamanan dan Data

- Jangan publikasikan token API, secret, atau kredensial Cloudflare.
- Buat cadangan D1 sebelum mengubah skema atau melakukan pemulihan data.
- **D1 Time Travel Restore menimpa keadaan database aktif**; jangan gunakan tanpa memahami dampaknya.
- Data Raid historis dari API mungkin tidak lagi menyertakan `members[]`. Worker berusaha mempertahankan data anggota yang sudah pernah tersimpan.
- Jadwal Cron, kuota API, dan ketersediaan data dapat memengaruhi kelengkapan riwayat.

## Kredit dan Atribusi

Proyek **Sambal Balado** dikembangkan dengan bantuan alat AI berikut:

- **Claude** — Anthropic
- **Gemini** — Google
- **ChatGPT** — OpenAI

AI digunakan untuk membantu penulisan kode, penjelasan, pemecahan masalah, dan pengembangan fitur. Penyebutan nama tersebut merupakan bentuk transparansi penggunaan AI, **bukan** pernyataan dukungan atau kerja sama resmi.

Clash of Clans adalah merek milik Supercell. Proyek ini merupakan proyek komunitas independen dan tidak berafiliasi dengan atau didukung oleh Supercell.
