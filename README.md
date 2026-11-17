# port-meridian

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/rismzz/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/rismzz/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Port Meridian** — an original open-world crime game in the browser. Sun, sea and sirens: steal cars, outrun the Meridian PD, and work four jobs for Rico and Mara — from your first stolen wheels to the Meridian Job.

- **A city to explore on foot and by car**: Port Meridian is a full 3D grid city — streets, intersections, pastel towers with lit windows, palms, street lamps and sidewalks — built with three.js (vendored) and rendered in real time.
- **Steal and drive**: walk up to any parked or traffic car and press E to take it; arcade driving with steering, braking, collisions and a chase camera you can drag to orbit.
- **Traffic and pedestrians**: 16 traffic cars cruise the grid (including taxis), 26 pedestrians stroll the sidewalks and scatter when a car comes at them.
- **Wanted level and police**: crimes (theft, hit-and-runs, shootings) raise up to 5 stars; Meridian PD cruisers chase, ram and try to bust you. Lose them and the heat dies down.
- **Missions and a story**: four jobs with waypoint beacons and timers — First Wheels, Courier Run, Heat, and the Meridian Job ($250–$1,200 payouts) — plus cash pickups, shootouts (click to fire), health, and progression that saves to localStorage.
- **HUD and minimap**: cash, health, wanted stars, mission objective with distance timer, speedometer, and a live minimap showing roads, the waypoint, traffic and police.
- **Feel and polish**: start screen with a cinematic city orbit, pause, busted screen, mission-complete toasts, synthesised WebAudio sound (engine hum, two-tone siren, shots, pickups) and M to mute.

## Play

Serve `game/` with any static server and open `index.html`, or run `node serve.ts` and open http://localhost:8080.

- **WASD / arrows** — move and drive · **Shift** — run · **E** — steal / exit car
- **Click** — shoot · **Drag mouse** — camera · **P** — pause · **M** — mute

Deterministic screenshot scenes: `?shot=start|play|chase|end&seed=1`.

## Screenshots

1. `1-chase.jpg` — a 4-star police chase through downtown, wanted level, minimap and mission objective on screen.
2. `2-play.jpg` — driving the first job through traffic.
3. `3-start.jpg` — the title screen over the city.
4. `4-end.jpg` — all jobs done, $2,450 in cash, cruising at 151 km/h.

---

Built for the [gta6-01 bounty on make.fun](https://make.fun/bounty/gta6-01?ref=aa4mcy45). Play it, fork it, or enter your own: https://make.fun/bounty/gta6-01?ref=aa4mcy45
