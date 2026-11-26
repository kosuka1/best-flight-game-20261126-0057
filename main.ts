// Skylane Runner hand-in program (Node 22, standard library only).
//
// The game itself is the static site in game/ — plain files a desktop
// browser loads offline. This program's whole job is delivery: copy game/
// and screenshots/ from beside this file into the output directory
// (/output in the grader, MAKEFUN_OUTPUT_DIR locally) and write the
// dossier.json the judge reads, using the kit's vendored buildDossier.
//
// The gate caps are passed through so this program refuses exactly what
// the scorer would refuse: more than 4 screenshots or one over 256 KiB,
// more than 993 entries under game/, 48 MiB of game files, or a game path
// over 1000 bytes. Only text_max_bytes shapes the dossier bytes.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
if (!existsSync(join(repoRoot, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing — nothing to hand in');
}
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });

const shotsOut = join(outputDir, 'screenshots');
mkdirSync(shotsOut, { recursive: true });
const shotsIn = join(repoRoot, 'screenshots');
if (existsSync(shotsIn)) {
  cpSync(shotsIn, shotsOut, { recursive: true });
}

const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
