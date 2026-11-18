// token-radar-01 entry source: read the sealed snapshot, derive the implied-value board,
// write the artifacts the dashboard and the dossier read.
//
// Node 22, standard library only, erasable TypeScript, so Node runs it directly as .ts.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildDossier, PLAIN_NAME } from './vendor/makefun-board.ts';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';

const DEFAULT_INPUT = '/input/snapshot.json';
const DEFAULT_OUTPUT = '/output';
const DOSSIER_TEXT_MAX_BYTES = 65536;
const SCREENSHOT_MAX = 4;
const SCREENSHOT_MAX_BYTES = 524288;

function flagValue(args: string[], flag: string): string | null {
  for (let i: number = 0; i < args.length; i += 1) {
    const arg: string = args[i] as string;
    if (arg === flag) {
      const value: string | undefined = args[i + 1];
      if (typeof value === 'string' && value !== '') return value;
      return null;
    }
    const prefix: string = `${flag}=`;
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return null;
}

function resolveInput(arg: string): string {
  if (existsSync(arg)) {
    const st = statSync(arg);
    if (st.isDirectory()) return join(arg, 'snapshot.json');
    return arg;
  }
  return arg;
}

function main(): void {
  const inputArg: string | null = flagValue(process.argv.slice(2), '--input');
  const inputPath: string = resolveInput(inputArg === null ? DEFAULT_INPUT : (inputArg as string));
  const snapshot = parseSnapshot(readFileSync(inputPath, 'utf8'));
  const board = buildRadar(snapshot);
  const issue: string | null = boardIssue(board, snapshot);
  if (issue !== null) {
    console.error(`token-radar-01: the board is invalid: ${issue}`);
    process.exit(1);
  }
  const outDir: string = process.env.MAKEFUN_OUTPUT_DIR === undefined || process.env.MAKEFUN_OUTPUT_DIR === '' ? DEFAULT_OUTPUT : (process.env.MAKEFUN_OUTPUT_DIR as string);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'board.json'), JSON.stringify({ rows: board.rows }, null, 2));
  writeFileSync(join(outDir, 'data.js'), dataScript(board));
  rmSync(join(outDir, 'dashboard'), { recursive: true, force: true });
  rmSync(join(outDir, 'screenshots'), { recursive: true, force: true });
  cpSync(join(dirname(process.argv[1] as string), 'dashboard'), join(outDir, 'dashboard'), { recursive: true });
  cpSync(join(dirname(process.argv[1] as string), 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
  const shotsDir: string = join(outDir, 'screenshots');
  const shots = readdirSync(shotsDir, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
  if (shots.length > SCREENSHOT_MAX) {
    console.error(`token-radar-01: the dashboard holds ${shots.length} screenshots, over the ${SCREENSHOT_MAX} the maker allows`);
    process.exit(1);
  }
  for (const name of shots) {
    const st = statSync(join(shotsDir, name));
    if (st.size > SCREENSHOT_MAX_BYTES) {
      console.error(`token-radar-01: screenshots/${name} is ${st.size} bytes, over the ${SCREENSHOT_MAX_BYTES} the maker allows`);
      process.exit(1);
    }
    if (!PLAIN_NAME.test(name)) {
      console.error(`token-radar-01: screenshots/${name} is not a plain file name`);
      process.exit(1);
    }
  }
  let dossier: Uint8Array;
  try {
    dossier = buildDossier(outDir, { text_max_bytes: DOSSIER_TEXT_MAX_BYTES, screenshots: { max: SCREENSHOT_MAX, max_bytes: SCREENSHOT_MAX_BYTES } });
  } catch (err) {
    const message: string = err instanceof Error ? err.message : String(err);
    console.error(`token-radar-01: the maker's dossier refused the dashboard: ${message}`);
    process.exit(1);
  }
  writeFileSync(join(outDir, 'dossier.json'), Buffer.from(dossier));

  console.log(`token-radar-01: protocols ${snapshot.protocols.length} watchlist ${snapshot.watchlist.length} rows ${board.rows.length}`);
  console.log(`token-radar-01: wrote board.json data.js dossier.json dashboard screenshots to ${outDir}`);
}

main();
