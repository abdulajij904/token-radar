// Token Radar (token-radar-01): read the sealed snapshot, score every pre-token protocol with the
// model in lib/model.ts, and write the hand-in to the output directory:
//
//   board.json    the ranked board (watchlist covered, ranks 1..N, implied value non-increasing)
//   data.js       the same board as window.RADAR, the dashboard's only data source
//   dashboard/    a copy of this repository's static page (no framework, no network)
//   screenshots/  a copy of this repository's three dashboard captures
//   dossier.json  buildDossier's summary of the two directories above, written last
//
// Usage:
//   node main.ts [--input <snapshot.json|directory>] [--output <directory>]
//
// The input defaults to /input/snapshot.json (a directory means the snapshot.json inside it) and
// the output to $MAKEFUN_OUTPUT_DIR, else /output. Node 22, standard library only, no network, and
// deterministic: the same snapshot always writes the same bytes.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildBoard, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));

/** The dossier's text cap: the one number that shapes its bytes. */
const TEXT_MAX_BYTES = 65_536;

/** A `--name value` or `--name=value` argument, or the fallback. */
function argValue(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  const at = argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < argv.length) return argv[at + 1]!;
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

function fail(message: string, code: number): never {
  process.stderr.write(`token-radar: ${message}\n`);
  process.exit(code);
}

const inputArg = argValue('input', '/input/snapshot.json');
const inputPath = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputPath)) fail(`no snapshot at ${inputPath} — pass --input <file|dir>`, 2);
const outDir = argValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

let snapshot;
try {
  snapshot = parseSnapshot(readFileSync(inputPath, 'utf8'));
} catch (err) {
  fail(err instanceof Error ? err.message : String(err), 2);
}

const board = buildBoard(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model produced a board the gate refuses: ${issue}`, 1);

/** Copy every regular file of one flat directory into another, skipping dotfiles. */
function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const src = join(from, name);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(to, name));
    names.push(name);
  }
  return names;
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board }, null, 0)}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(snapshot, board));
const dashFiles = copyDir(join(repoDir, 'dashboard'), join(outDir, 'dashboard'));
const shots = copyDir(join(repoDir, 'screenshots'), join(outDir, 'screenshots'));
if (dashFiles.length === 0) fail('dashboard/ is empty — the page is part of the hand-in', 1);
if (shots.length < 3) fail(`screenshots/ holds ${shots.length} image(s) — hand in three: the board, a detail view, a filtered view`, 1);

// The dossier goes last: it summarises the dashboard and screenshots as they now stand in the output.
const dossier = buildDossier(outDir, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

const early = board.filter((r) => !r.on_watchlist).length;
process.stdout.write(
  `token-radar: snapshot of ${snapshot.as_of}: ${snapshot.protocols.length} protocols, watchlist ${snapshot.watchlist.length}\n` +
    `token-radar: board of ${board.length} rows (${snapshot.watchlist.length} watchlist + ${early} early), top row ${board[0]!.slug} at $${board[0]!.implied_value_usd.toLocaleString('en-US')}\n` +
    `token-radar: wrote board.json, data.js, dashboard/ (${dashFiles.length} files), screenshots/ (${shots.length} images), dossier.json to ${outDir}\n`,
);
