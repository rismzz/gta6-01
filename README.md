# PORT MERIDIAN — Make GTA 6

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/rismzz/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/rismzz/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game in the spirit of GTA 6, built for the
[Make GTA 6 bounty](https://make.fun/bounty/gta6-01) on make.fun. Mara Voss,
driver-for-hire, has one week to make it in Port Meridian — a sun-soaked
coastal city of 64 blocks, a beach and a marina — or get out.

## Play

Serve `game/` with any static server (or `node serve.ts`) and open
`http://localhost:8080`. Desktop Chrome, keyboard and mouse, no network needed.

- **WASD** move / drive · **mouse drag** orbit camera · **Shift** run
- **E** enter or leave a car (any traffic car can be jacked)
- **F** punch · **Q** shoot the pistol · **P** pause · **M** mute · **Space** confirm

## The game

- **A city to explore on foot and by car**: procedural 8×8-block Port Meridian with a beach, a marina with a yacht, a bank, a casino, a hospital, a stadium, a paint shop and a hideout — all generated from a seed (`?seed=N` rebuilds the same city).
- **Traffic and pedestrians**: cars looping the road grid in right-hand lanes, walkers on the sidewalks who flee when crimes happen.
- **Cars to steal and drive**: arcade handling, carjacking, traffic that brakes for you, patrol cars that ram you.
- **A wanted level and police who respond**: 0–5 stars, foot cops who chase and bust, patrol cars that chase and ram, stars that cool off after a quiet spell.
- **Missions and a story**: four jobs for the fixer Vex — *Hot Wheels* (steal a car, deliver it to the paint shop), *The Runaround* (a timed three-checkpoint drive), *The Big Score* (crack the bank vault, then get back to the hideout), *Heat Wave* (a five-star escape to the yacht).
- **Combat**: fists and a pistol with tracers, ammo pickups, health pickups, cash stashes hidden around the city.
- **A HUD with a minimap**: cash, wanted stars, health, a live minimap with the mission beacon, speed, objective line and message feed.
- **Sound**: fully synthesized WebAudio — engine hum, sirens, gunshots, pickups, mission jingles. No audio files.

## Tech

Three.js r160 vendored under `game/vendor/`; the game itself is plain ES
modules with no build step and no network requests. The world is deterministic
from `?seed=N`. `?shot=start|drive|chase|mission` stages the four screenshots
from real simulated play. `main.ts` copies `game/` and `screenshots/` to the
output directory and writes `dossier.json` with the vendored make.fun library.

## License

MIT — see [LICENSE](LICENSE).

[Play Port Meridian on make.fun](https://make.fun/bounty/gta6-01?ref=aa4mcy45)
