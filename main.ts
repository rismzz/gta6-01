// PORT MERIDIAN — the entrypoint for gta6-01 (Node 22, standard library only).
// The game: PORT MERIDIAN, a 3D open-world crime game. Mara Voss, driver-for-hire,
// works four jobs for the fixer Vex across a seeded procedural coastal city —
// steal a car, run a timed delivery, crack the bank vault, and escape a five-star
// manhunt to the yacht — with traffic, pedestrians, foot cops and patrol cars,
// a wanted system, combat, a HUD with a live minimap, and synthesized sound.
// The world is deterministic from ?seed=N, and ?shot=start|drive|chase|mission
// stages the four screenshots from real simulated play.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files, in all, or a path under game/ over 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
