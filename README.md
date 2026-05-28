# 🖼 ImgConvert

**Konversi gambar ke format apapun — langsung di browser, tanpa upload ke server.**

> 100% client-side · Tidak ada data yang dikirim · Gratis selamanya

---

## ✨ Fitur

- **8 format output** — PNG, JPG, WEBP, GIF, BMP, AVIF, TIFF, ICO
- **Batch conversion** — upload banyak file sekaligus
- **Resize gambar** — ubah dimensi dengan opsi pertahankan rasio aspek
- **Kualitas output** — slider kualitas untuk format lossy (JPG, WEBP, AVIF)
- **Background color picker** — pilih warna pengganti area transparan
- **Batch rename** — pola nama dengan variabel `{name}` dan `{n}`
- **Strip EXIF** — hapus metadata untuk privasi
- **Before/After preview** — perbandingan gambar sebelum & sesudah konversi
- **Paste dari clipboard** — `Ctrl+V` langsung dari screenshot
- **Unduh ZIP** — download semua hasil konversi sekaligus
- **Theme toggle** — mode terang & gelap
- **Drag & drop** — seret gambar langsung ke area upload

---

## 🚀 Cara Pakai

1. **Buka website** di browser
2. **Seret gambar** ke area upload, atau klik untuk memilih file
3. **Pilih format output** yang diinginkan (PNG, JPG, WEBP, dll)
4. **Atur opsi** — resize, kualitas, background, rename (opsional)
5. **Klik "Konversi Semua"**
6. **Unduh** file satu per satu, atau semua sekaligus dalam format ZIP

---

## ⚠️ Limitasi

| Format | Status | Keterangan |
|--------|--------|------------|
| PNG · JPG · WEBP | ✅ Penuh | Didukung semua browser modern |
| GIF | ⚠️ Parsial | Hanya gambar diam, animasi tidak bisa dibuat |
| AVIF | ⚠️ Parsial | Butuh Chrome 85+, Edge 85+, Firefox 93+ |
| TIFF | ⚠️ Parsial | Output menggunakan PNG encoding |
| ICO | ⚠️ Parsial | PNG 32×32 berekstensi .ico, bukan multi-size |
| RAW (CR2, NEF, ARW) | ❌ Tidak didukung | Browser tidak bisa membaca format RAW |
| File > 50 MB | ❌ Ditolak | File 20–50 MB mungkin lambat tergantung RAM |
| SVG Input | ⚠️ Parsial | Font eksternal & efek kompleks mungkin tidak ter-render |

---

## 🔒 Privasi

Semua proses konversi terjadi **100% di browser kamu** menggunakan Canvas API bawaan browser. Tidak ada gambar yang dikirim ke server manapun. Tidak ada tracking. Tidak ada iklan.

---

## 🗂️ Struktur File

```
imgconvert/
├── index.html          # Halaman utama
├── css/
│   └── style.css       # Semua styling & tema
└── js/
    ├── converter.js    # Logika konversi (Canvas API)
    ├── ui.js           # Render & alert helpers
    └── app.js          # Entry point & state management
```

---

## 🛠️ Teknologi

- **HTML · CSS · JavaScript** murni — tanpa framework
- **Canvas API** — untuk konversi format gambar
- **JSZip** — untuk fitur unduh semua sebagai ZIP
- **GitHub Pages** — hosting gratis & statis

---

## 📦 Menjalankan Lokal

Tidak perlu build tool atau install apapun. Cukup:

```bash
# Clone repo
git clone https://github.com/username/imgconvert.git

# Masuk folder
cd imgconvert

# Buka di browser (bisa juga langsung dobel klik index.html)
# Atau pakai live server jika pakai VSCode:
# Install ekstensi "Live Server" → klik kanan index.html → Open with Live Server
```

> **Catatan:** Beberapa fitur (seperti paste clipboard) butuh HTTPS atau `localhost` untuk bekerja. Gunakan Live Server atau akses via GitHub Pages.

---

*Dibuat dengan ☕ — berjalan sepenuhnya di browser kamu.*
