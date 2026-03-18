# ⚙ OwO Tools

Dashboard web untuk mengelola dan mengontrol bot Discord **OwO-Dusk** secara real-time melalui browser, tanpa perlu menyentuh file konfigurasi secara manual.

> ⚠️ **Disclaimer:** Proyek ini menggunakan selfbot Discord. Penggunaan selfbot melanggar Terms of Service Discord. Gunakan dengan risiko sendiri.

---

## ✨ Fitur

### 🌐 Web Dashboard
- Akses melalui browser di `http://localhost:1200`
- Tema **Steampunk Gaming** — font Cinzel & Rajdhani, warna copper/gold
- **PWA** — bisa diinstall sebagai app di home screen Android
- Tidak perlu install aplikasi tambahan — berjalan langsung di Termux

### 📊 Overview & Statistik
- Total cowoncy, uptime hari ini, total commands, total captchas
- Chart cowoncy earnings, weekly runtime, gamble winrates, total commands sent
- Live activity console — auto-refresh tiap 5 detik

### ⚔️ Kontrol Command
- Toggle ON/OFF setiap command secara real-time (hot reload — tidak perlu restart)
- Edit cooldown min-max per command
- sell/sac: pilih rarity yang dijual/disacrifice
- pray/curse: daftar user ID target, ping user, custom channel
- cookie: user ID target, ping user
- shop: pilih item yang dibeli (Ring 1-7)
- lottery: jumlah tiket
- autoHuntBot: cash to spend, upgrader ON/OFF, sleep time, traits & priorities

### 🎰 Kontrol Gambling
- Toggle ON/OFF coinflip, slots, blackjack
- Edit start value, multiplier, cooldown per game
- Edit allotted amount

### 💎 Gem Settings
- Toggle auto use gems ON/OFF
- Pilih order (lowest to highest)
- Toggle disable hunt jika tidak ada gem
- Toggle per tier (common, uncommon, rare, epic, mythical, legendary, fabled)
- Toggle per jenis gem (huntGem, empoweredGem, luckyGem, specialGem)

### 🌐 Global Settings
- Toggle typing indicator, silent messages, offline status, battery check
- Konfigurasi captcha notifications (vibrate, TTS, audio, recurring alerts)
- Battery check: minimum percentage, check interval
- Captcha solver: image solver & hcaptcha solver, API key, retries

### 📡 Channels & Webhook
- Toggle webhook, edit webhook URL
- Kelola channel switcher per user

### 🔑 Token Management
- Lihat semua token (tersensor untuk keamanan)
- Tambah token baru + channel ID dari dashboard
- Hapus token yang tidak dipakai

### 📋 Console Logs
- Live log aktivitas bot per akun

---

## 🤖 Kontrol Bot via Discord

Bot bisa dikontrol langsung dari Discord dengan mengirim pesan di channel bot:

| Perintah | Fungsi |
|----------|--------|
| `.stop` | Pause bot |
| `.start` | Resume bot |
| `.restart_captcha` | Restart setelah captcha |

Perintah ini dikonfigurasi di `config/global_settings.json` pada key `commandToStopUser`, `commandToStartUser`, dan `commandToRestartAfterCaptcha`.

---

## 📱 Platform

| Platform | Status |
|----------|--------|
| Termux (Android) | ✅ Didukung penuh |
| Linux | ✅ Didukung |
| Windows | ⚠️ Belum ditest |
| macOS | ⚠️ Belum ditest |

---

## 🚀 Instalasi

### 1. Clone repository
```bash
git clone https://github.com/EqualityDev/Tools-farm.git
cd Tools-farm
```

### 2. Jalankan setup
```bash
python3 setup.py
```
Setup akan otomatis menginstall semua dependencies yang dibutuhkan, termasuk numpy, PIL, onnxruntime, dan termux-api.

### 3. Konfigurasi
Edit file konfigurasi sesuai kebutuhan:
- `config/settings.json` — konfigurasi per command
- `config/global_settings.json` — konfigurasi global
- `config/captcha.toml` — konfigurasi captcha solver
- `tokens.txt` — token Discord dan channel ID

Format `tokens.txt` (satu baris per akun):
```
TOKEN_DISCORD_1 CHANNEL_ID_1
TOKEN_DISCORD_2 CHANNEL_ID_2
```

### 4. Jalankan bot
```bash
bash run.sh
```

`run.sh` adalah wrapper yang otomatis restart bot jika mati. Tekan `Ctrl+C` **2x cepat** untuk stop sepenuhnya.

---

## 🌐 Akses Dashboard

Setelah bot berjalan, buka browser dan akses:
```
http://localhost:1200
```

Password default ada di `config/global_settings.json` pada key `website.password`.

### Install sebagai PWA (Android)
1. Buka `http://localhost:1200` di Chrome
2. Ketuk **3 titik** → **Add to Home screen**
3. Icon OwO Tools akan muncul di home screen

---

## 📁 Struktur Project

```
Tools-farm/
├── uwu.py                  # File utama bot + Flask API
├── run.sh                  # Auto-restart wrapper
├── setup.py                # Script instalasi dependencies
├── requirements.txt        # Python dependencies
├── tokens.txt              # Token + Channel ID
├── config/
│   ├── settings.json       # Konfigurasi per-command
│   ├── global_settings.json # Konfigurasi global
│   ├── misc.json           # Alias command
│   └── captcha.toml        # Konfigurasi captcha solver
├── cogs/                   # 24 fitur bot sebagai cog
├── templates/
│   ├── index.html          # Halaman utama dashboard
│   └── settings.html       # Halaman settings (5 tab)
├── static/
│   ├── style.css           # CSS tema steampunk
│   ├── script.js           # JS halaman utama
│   ├── settings.js         # JS halaman settings
│   ├── manifest.json       # PWA manifest
│   ├── service-worker.js   # PWA service worker
│   └── imgs/               # Icon PWA
└── utils/                  # Utility functions & captcha solver
```

---

## ⚙️ Stack Teknologi

- **Python 3.13** — runtime
- **discord.py-self** — selfbot library
- **Flask** — web dashboard
- **SQLite** — database statistik
- **Chart.js** — visualisasi data
- **Cinzel + Rajdhani** — Google Fonts (tema steampunk)
- **Termux** — Android terminal emulator

---

## 🔒 Keamanan

- Dashboard dilindungi password
- Token di dashboard ditampilkan tersensor
- **Jangan** commit `tokens.txt` ke repository publik
- **Jangan** commit `config/global_settings.json` ke repository publik
- Tambahkan keduanya ke `.gitignore` sebelum go public

---

## 🙏 Credits

- Bot original: [owo-dusk](https://github.com/echoquill/owo-dusk) by **EchoQuill**
- Dashboard & modifikasi: **EqualityDev**

---

## 📄 Lisensi

Project ini berdasarkan [owo-dusk](https://github.com/echoquill/owo-dusk) yang dilisensikan di bawah **GNU GPL v3.0**.
