# Panduan Integrasi Direct MetaTrader 5 (MT5) Lootly untuk Valetax & Windows VPS

Dokumentasi resmi integrasi sinkronisasi otomatis transaksi MetaTrader 5 ke jurnal Lootly.

---

## 1. Mengapa Membutuhkan Windows VPS?

1. **Batasan Aplikasi Mobile**: Aplikasi MetaTrader 5 resmi di iOS (iPhone) dan Android tidak mendukung eksekusi Expert Advisor (EA) maupun skrip otomatis karena pembatasan dari MetaQuotes.
2. **Solusi Direct Connector**: Anda tetap dapat trading dengan leluasa dari HP (iPhone/Android). Terminal MT5 Desktop yang terpasang di Windows VPS akan berjalan di latar belakang (background) dan mendeteksi setiap posisi baru, modifikasi SL/TP, hingga posisi ditutup, lalu menyinkronkannya secara real-time ke akun Lootly Anda melalui koneksi HTTPS yang aman.
3. **Keamanan 100% Read-Only**: Lootly **TIDAK PERNAH** meminta kata sandi trading Anda dan **TIDAK BISA** membuka, mengubah, atau menutup posisi Anda di broker Valetax. EA ini murni hanya membaca (read-only) riwayat dan transaksi Anda.

---

## 2. Persyaratan Awal

- Akun trading **Valetax MT5** (Demo atau Real).
- Layanan **Windows VPS** yang aktif (dapat menggunakan provider VPS apa pun seperti Contabo, ForexVPS, OVH, dsb.).
- Akun Lootly di [https://lootly-mu.vercel.app](https://lootly-mu.vercel.app).

---

## 3. Langkah-Langkah Pemasangan di Windows VPS

### Langkah 1: Pasang Terminal MT5 Desktop di VPS
1. Buka Remote Desktop Connection (RDP) ke Windows VPS Anda.
2. Unduh installer MetaTrader 5 dari situs resmi **Valetax** atau [metatrader5.com](https://www.metatrader5.com).
3. Jalankan instalasi dan buka aplikasi MT5 di VPS Anda.
4. Login ke akun Valetax Anda menggunakan nomor akun (Login), password, dan server broker (misalnya `Valetax-Live` atau `Valetax-Demo`).

### Langkah 2: Unduh File EA Lootly
Unduh file **`Lootly_MT5_Connector.mq5`**:
- Anda dapat mengunduhnya langsung dari menu **Pengaturan (Settings) > Koneksi MT5** di aplikasi Lootly, atau
- Download dari URL: `https://lootly-mu.vercel.app/Lootly_MT5_Connector.mq5`.

### Langkah 3: Pasang dan Kompilasi EA di MetaEditor
1. Di terminal MT5 pada VPS, klik menu **File > Open Data Folder**.
2. Masuk ke folder: `MQL5` $\to$ `Experts`.
3. Salin (copy) file `Lootly_MT5_Connector.mq5` ke dalam folder `Experts` tersebut.
4. Kembali ke terminal MT5, tekan tombol **F4** pada keyboard untuk membuka **MetaEditor** (atau klik ikon IDE di toolbar).
5. Pada panel Navigator di sebelah kiri MetaEditor, buka folder `Experts`, lalu klik dua kali pada file `Lootly_MT5_Connector.mq5`.
6. Tekan tombol **F7** (atau klik tombol **Compile** di toolbar atas).
7. Pastikan pada tab *Errors* di bagian bawah tertulis: **`0 errors, 0 warnings`**.

### Langkah 4: Aktifkan Izin WebRequest di MT5
Terminal MT5 membutuhkan izin keamanan untuk mengirim data ke server Lootly via HTTPS:
1. Di MT5 Desktop, klik menu **Tools > Options** (atau tekan `Ctrl + O`).
2. Pilih tab **Expert Advisors**.
3. Centang opsi: **Allow Algo Trading**.
4. Centang opsi: **Allow WebRequest for listed URL**.
5. Klik tombol tanda tambah (`+`) atau klik dua kali di daftar URL, lalu masukkan URL berikut:
   ```text
   https://lootly-mu.vercel.app
   ```
6. Klik **OK** untuk menyimpan pengaturan.
7. Pastikan tombol **Algo Trading** di toolbar utama MT5 menyala (berwarna hijau).

---

## 4. Menghubungkan EA dengan Akun Lootly Anda

1. Buka Lootly di browser Anda: [https://lootly-mu.vercel.app](https://lootly-mu.vercel.app).
2. Masuk ke menu **Pengaturan (Settings)**, lalu pilih tab/seksi **Koneksi MT5**.
3. Klik tombol **Buat Token Konektor**.
4. Beri nama konektor (misalnya *"Valetax MT5 VPS"*), lalu klik **Buat Token**.
5. Salin token rahasia yang muncul (berawalan `lootly_mt5_live_...`).
   > *Catatan: Token ini hanya ditampilkan satu kali demi keamanan. Jangan membagikannya kepada siapa pun.*
6. Buka kembali terminal MT5 di VPS:
   - Buka sembarang chart (misal `XAUUSD` atau `EURUSD` timeframe M1 / H1).
   - Pada panel **Navigator** (tekan `Ctrl + N`), buka kategori **Expert Advisors**.
   - Tarik (drag & drop) `Lootly_MT5_Connector` ke chart yang terbuka.
   - Pada jendela pengaturan EA yang muncul, buka tab **Inputs**:
     - **`InpLootlyUrl`**: Biarkan default (`https://lootly-mu.vercel.app/api/mt5/webhook`).
     - **`InpConnectorToken`**: Tempelkan (paste) token yang Anda salin dari Lootly tadi.
   - Buka tab **Common**, pastikan opsi **Allow Algo Trading** dicentang.
   - Klik **OK**.
7. Di pojok kanan atas chart akan muncul nama EA dengan ikon topi biru kecil bertanda aktif.
8. Periksa tab **Experts** di jendela Toolbox (bawah MT5). Anda akan melihat pesan:
   ```text
   [Lootly MT5] Initializing Lootly Read-Only Connector v1.00
   [Lootly MT5] Broker: Valetax
   [Lootly MT5] Account Login: 12345678
   [Lootly MT5] Reconciliation complete. Account synchronized.
   ```

---

## 5. Uji Coba Sinkronisasi dari HP

1. Buka aplikasi MT5 di HP Anda (iPhone atau Android) dengan akun Valetax yang sama.
2. Buka 1 posisi trading (disarankan gunakan akun Demo terlebih dahulu, misal BUY 0.01 lot XAUUSD).
3. Dalam 5 detik, periksa menu **Journal** atau **Dashboard** di Lootly:
   - Posisi aktif akan langsung muncul di Lootly dengan label badge **`MT5 Sync`**.
4. Ubah Stop Loss (SL) atau Take Profit (TP) dari HP Anda:
   - Lootly akan otomatis memperbarui harga SL dan TP pada trade yang sama tanpa membuat trade duplikat.
5. Tutup posisi trading dari HP Anda:
   - Status di Lootly akan langsung berubah menjadi **Selesai (Closed)**.
   - Nilai PnL bersih (termasuk komisi dan swap) serta persentase profit akan dihitung otomatis ke Dashboard, Kurva Ekuitas, dan Analitik trading Anda.

---

## 6. Pemecahan Masalah (Troubleshooting)

- **Status di Lootly "Terputus" / "Disconnected"**:
  - Pastikan terminal MT5 di VPS tetap menyala (tidak tertutup).
  - Pastikan tombol *Algo Trading* di MT5 berwarna hijau.
  - Periksa apakah URL `https://lootly-mu.vercel.app` sudah ditambahkan di *Tools > Options > Expert Advisors > Allow WebRequest*.
- **Pesan `HTTP 401 Unauthorized` di Tab Experts MT5**:
  - Token konektor Anda salah atau telah dicabut. Buat token baru di Pengaturan Lootly dan masukkan ke input EA.
- **Pesan `WebRequest failed. Error code: 4014`**:
  - MT5 belum diizinkan untuk menghubungi URL server Lootly. Ikuti kembali Langkah 4 di atas untuk menambahkan URL ke daftar WebRequest.
