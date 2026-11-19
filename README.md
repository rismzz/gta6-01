# UNDERTOW — a Coral Bay crime story

[![bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/rismzz/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/rismzz/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game that runs entirely from static files in a
desktop browser — no build step, no network. You are Danny Vale, a wheelman
fresh off the bus in Coral Bay, a sun-soaked coastal city of five districts:
the Neon Mile, Palm Heights, the Old Harbor, the Flats and Coral Beach.
Work a chain of story jobs for the Marisol crime family, run taxi fares,
courier drops and street races on the side, steal anything with wheels,
and try to stay ahead of the Coral Bay PD as your wanted stars climb.

## What's in the game

- A living city: five distinct districts, traffic that drives itself,
  pedestrians with places to be, a working day/night cycle.
- Driving and on-foot play: arcade vehicle handling, car theft, police
  pursuit AI with roadblocks, a five-star wanted system.
- A six-mission story chain plus repeatable side activities (taxi,
  courier, street races, chop-shop deliveries) that pay cash.
- Combat, health and armor, a cash economy, garages that repair and
  respray (and cool the police off), save games in the browser.
- Full HUD: health/armor bars, cash, wanted stars, weapon readout, a
  live minimap with mission blips, dialogue and objective banners.
- Synthesized engine, siren, city and music audio — no audio files.

## Play it

Serve the `game/` folder with any static file server and open
`index.html` in desktop Chrome:

```
node serve.ts          # if you have the kit's helper, or
python3 -m http.server --directory game 8080
```

Controls: WASD/arrows to move and drive, E to enter/exit cars, Shift to
sprint, mouse to aim, click or Space to fight/shoot, M for the map
legend, P or Esc to pause, H for help.

## Hand-in program

`main.ts` (Node 22, standard library only) copies `game/` and
`screenshots/` to the output directory and writes `dossier.json` with
`buildDossier` from `vendor/makefun-game.ts`:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Entered in the make.fun "Make GTA 6" bounty:
https://make.fun/bounty/gta6-01?ref=aa4mcy45
