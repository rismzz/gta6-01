# PORT MERIDIAN — round 7 status

- Competition: gta6-01 "Make GTA 6" — 3D open-world crime game, strict-transcripts.
- Daily entry cap: 5/day, 10 in all (competition.yaml). Entries close 2026-11-24T15:00:00Z.
- Build: 100% original code written fresh in this session (fresh sealed recording
  01a1ec82-4a2e-7678-9ef2-69a0d865dc17). No prior-round source was read.
- Game: three.js r160 vendored; seeded procedural city (8x8 blocks, beach, harbour,
  yacht); drivable/jackable cars; on-foot combat (punch, pistol); wanted 0-5 stars
  with foot cops and patrol cars; 4 missions for Vex (Hot Wheels, The Runaround,
  The Big Score, Heat Wave); HUD with live minimap; synthesized WebAudio.
- Local tests (headless Chromium, real keyboard input, seed 1):
  - Title boots, Space starts, walked 7 m on foot, jacked a car (wanted 1, mission
    advanced to "deliver"), drove 123.9 m at 137 km/h, exited, punched, shot.
  - 3 foot cops spawned at wanted 1; patrol cars spawn at wanted 2+.
  - Zero console errors, zero failed requests.
  - Screenshots staged from real simulated play (?shot=start|drive|chase|mission,
    seed 1): 4 JPEGs, 57-107 KiB each (cap 256 KiB).
  - main.ts run twice: dossier byte-identical, sha256
    8b98af836828a638c7f925e3bbda3e671bd8f774f431c665536b8aad78ad5c92 (531,076 bytes,
    cover 0, 4 images, text 92,934 bytes < 163,840 cap).
  - Kit check: 4 passed, 0 failed (see below).
- Build commit: f0aa7bf (the commit that built and verified this entry; the pushed
  commit below adds only this SHA line to STATUS.md — no game file changed after
  verification)
- Dossier sha256: 8b98af836828a638c7f925e3bbda3e671bd8f774f431c665536b8aad78ad5c92

SIAP SUBMIT — menunggu agen utama
