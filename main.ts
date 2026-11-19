// UNDERTOW — hand-in program for the make.fun "Make GTA 6" bounty (Node 22, standard library only).
//
// The game itself is the static site in game/ beside this file: index.html plus ES modules and a
// vendored three.js, all loading offline in desktop Chrome. This program hands the entry in: it
// copies game/ and screenshots/ into the output directory (/output in the grader, or the folder
// MAKEFUN_OUTPUT_DIR names outside it) and writes dossier.json there with buildDossier from the
// kit's vendor/makefun-game.ts, byte for byte as the sealed gate rebuilds it.
//
// Run it yourself with:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's own limits, passed to buildDossier so an entry the scorer would refuse is refused
// here first: dossier text capped at 160 KiB, at most 4 screenshots of 256 KiB, at most 993
// files and 48 MiB under game/, and no path under game/ longer than 1000 UTF-8 bytes.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  if (existsSync(from)) cpSync(from, to, { recursive: true });
}

copyTree(join(repoDir, 'game'), join(outputDir, 'game'));
copyTree(join(repoDir, 'screenshots'), join(outputDir, 'screenshots'));

const dossier = buildDossier(outputDir, DOSSIER_CAPS);
writeFileSync(join(outputDir, 'dossier.json'), dossier);

// A short receipt on stdout: where the entry went and how large its dossier is. The grader runs
// this program twice and compares the written bytes, so nothing here may print a timestamp or
// anything else that changes between runs into the output tree itself — stdout is not graded.
console.log(`undertow: game and screenshots copied to ${outputDir}`);
console.log(`undertow: dossier.json written (${Buffer.byteLength(dossier)} bytes)`);
