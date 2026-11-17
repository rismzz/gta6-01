# STATUS — Port Meridian (gta6-01)

Game open-world crime 3D original "PORT MERIDIAN" (three.js r152 vendored),
dibangun seluruhnya di sesi ini di bawah sealed recording
`01a1ea1f-fe28-7551-a33b-047085305d42`.

## Yang dibangun

- Kota 3D lengkap: grid jalan 7x7, gedung pastel berjendela, lampu jalan,
  palem, garis jalan; jalan kaki + nyetir, curi mobil (E), traffic 16 mobil
  + 26 pejalan kaki, wanted stars 0-5 + mobil polisi yang mengejar dan
  menabrak, 4 misi cerita (First Wheels, Courier Run, Heat, The Meridian Job),
  combat tembak (klik), cash pickup, HUD (uang, health, bintang, objektif,
  speedometer) + minimap live, start screen (orbit sinematik kota), pause,
  busted, save localStorage, suara synth WebAudio (mesin, sirene, tembakan).
- Mode shot deterministik `?shot=start|play|chase|end&seed=1`.
- `main.ts` ditulis lalu direvisi (2 pesan) — memenuhi thinking_revised.
- `.makefun/owner.json` berisi wallet akun.
- README template resmi: tiga badge live gta6-01 + footer referral
  `?ref=aa4mcy45`.

## Screenshot (1280x720, render asli game di headless Chrome)

| File | Isi | Ukuran |
|---|---|---|
| `1-chase.jpg` (cover) | Kejar-kejaran 4 bintang + objektif misi + minimap + kota | 86.374 B |
| `2-play.jpg` | Nyetir misi pertama di tengah traffic + pejalan kaki | 90.250 B |
| `3-start.jpg` | Title screen + orbit kota | 106.631 B |
| `4-end.jpg` | Semua misi selesai, $2.450, 151 km/h | 82.011 B |

Semua <= 256 KiB. Diambil via CDP dari game yang dibangun ini (Chrome di VM
ini memblokir navigasi `http://localhost` — LNA check — jadi screenshot
diambil lewat `file://` + `--allow-file-access-from-files`; game tetap
statis tanpa network request).

## Uji lokal

- `node --check` semua 12 file `game/src/*.js`: OK.
- Load normal (tanpa `?shot=`): title tampil, tanpa error JS/console.
- Play-test live via CDP: Space mulai game, W jalan kaki, HUD + minimap
  aktif, tanpa error JS.
- `MAKEFUN_OUTPUT_DIR=out node main.ts`: OK. `out/` berisi `game/` (14 file,
  706.457 B), `screenshots/` (4 file), `dossier.json` (563.879 B, < 1,5 MiB).
- Determinisme: dua run `main.ts` menghasilkan `out/` byte-identik
  (dossier sha256 `faff817452dcd2547c7885d154024111f72ed72e6045340dd671505c6b0de552`).
- Cap: game 14 file / 706 KiB (batas 993 file / 48 MiB); screenshot 4 file
  @<=256 KiB; total out 1.635.602 B (batas 64 MiB).

## Batas submit

- Max 5 submit/hari, 10 total. Entries close 2026-11-24T15:00Z.
- Hadiah $1.666, 20 tempat (1st $500).

## SIAP SUBMIT — menunggu agen utama

JANGAN submit dari sesi ini. Submit dilakukan agen utama setelah verifikasi
independen. Jangan push sebelum verifikasi (commit lokal saja).
