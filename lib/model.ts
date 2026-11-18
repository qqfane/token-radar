// token-radar-01: the value model for the token launch radar.
//
// The snapshot is sealed protocol data: TVL, a seven-day change and, when DefiLlama
// records one, a market cap. A protocol with a market cap has issued its token; one
// without is still waiting on a launch. This module derives, from those figures alone,
// the implied value of a token that does not exist yet and the steps that farm it.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | number | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface Row {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  base_multiple: number;
  momentum: number;
  age_factor: number;
  implied_value_usd: number;
  farm_steps: string[];
}

export interface RadarModel {
  global_median_multiple: number;
  category_multiples: Record<string, number>;
  formula: string;
}

export interface Board {
  rows: Row[];
  model: RadarModel;
}

const DAY_MS = 86400000;
const MAX_DAYS_LISTED = 1095;
const BOARD_SIZE = 200;
const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isPreToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: Protocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSION_MARKER.test(p.name);
}

function compareSlug(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a: number, b: number) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return (sorted[mid - 1] as number + sorted[mid] as number) / 2;
}

function daysSinceListed(listedAt: string | number | null, asOf: string): number | null {
  if (listedAt === null || listedAt === undefined) return null;
  if (typeof listedAt !== 'string') return null;
  const asOfMs = Date.parse(asOf);
  if (Number.isNaN(asOfMs)) return null;
  const listedMs = Date.parse(listedAt);
  if (Number.isNaN(listedMs)) return null;
  return Math.max(0, (asOfMs - listedMs) / DAY_MS);
}

function momentumOf(protocol: Protocol): number {
  if (protocol.change_7d === null || protocol.change_7d === undefined) return 1;
  const growth = clamp(protocol.change_7d, -30, 40);
  return clamp(1 + growth / 100, 0.7, 1.4);
}

function ageFactorOf(protocol: Protocol, asOf: string): number {
  const days = daysSinceListed(protocol.listed_at, asOf);
  if (days === null) return 1;
  return 1 + (Math.min(days, MAX_DAYS_LISTED) / MAX_DAYS_LISTED) * 0.25;
}
function categoryMultiple(snapshot: Snapshot, category: string | null): number {
  const ratios: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.category === category && p.mcap_usd !== null && p.tvl_usd > 0) {
      ratios.push(p.mcap_usd / p.tvl_usd);
    }
  }
  if (ratios.length >= 3) return median(ratios);
  const globalRatios: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.tvl_usd > 0) globalRatios.push(p.mcap_usd / p.tvl_usd);
  }
  const globalMedian = median(globalRatios);
  return globalMedian === 0 ? 1 : globalMedian;
}

function impliedValue(protocol: Protocol, multiple: number, momentum: number, ageFactor: number): number {
  const value = protocol.tvl_usd * multiple * momentum * ageFactor;
  const rounded = Math.round(value);
  return Math.max(1, rounded);
}

function farmStepsFor(name: string, category: string | null, tvlUsd: number): string[] {
  const cat = category === null ? 'DeFi' : category;
  const tvlK = Math.max(1, Math.round(tvlUsd / 1000));
  const seedUsd = Math.max(500, Math.min(5000, tvlK));
  return [
    `Apply to the ${name} testnet or community incentive program, budgeting about $250 in grants or test liquidity and expecting allocation in 7 to 21 days.`,
    `Provision a lightweight ${cat} node or watcher bot for ${name}, spending roughly $20 in compute and finishing in under 2 days.`,
    `Seed the ${name} pool with an initial liquidity position of about $${seedUsd} and watch the first epoch for 3 to 10 days.`,
    `Prepare a wallet and small capital runway for ${name}, setting aside about $500 and holding through the launch window for 14 days.`,
    `Stake or lock funds through ${name}'s farm or delegation queue, budgeting about $100 in fees and waiting 5 to 30 days for the queue to fill.`,
    `Track the ${name} announcement cadence and snapshot thread, then farm the first round within 1 to 2 weeks, budgeting about $150 in seed capital.`,
  ];
}

export function parseSnapshot(text: string): Snapshot {
  return JSON.parse(text) as Snapshot;
}

export function buildRadar(snapshot: Snapshot): Board {
  const asOf = snapshot.as_of;
  const globalRatios: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.tvl_usd > 0) globalRatios.push(p.mcap_usd / p.tvl_usd);
  }
  const globalMedianMultiple = globalRatios.length > 0 ? median(globalRatios) : 1;

  const multipleFor = (category: string | null): number => {
    const ratios: number[] = [];
    for (const p of snapshot.protocols) {
      if (p.category === category && p.mcap_usd !== null && p.tvl_usd > 0) ratios.push(p.mcap_usd / p.tvl_usd);
    }
    if (ratios.length >= 3) return median(ratios);
    return globalMedianMultiple;
  };

  // The snapshot's own board selection: the watchlist floor first (never filtered),
  // then the highest-TVL rankable early protocols below the floor, to exactly 200 rows.
  const watchlist = new Set<string>(snapshot.watchlist);
  const chosen: Protocol[] = [];
  const chosenSlugs = new Set<string>();
  for (const p of snapshot.protocols) {
    if (watchlist.has(p.slug) && !chosenSlugs.has(p.slug)) {
      chosen.push(p);
      chosenSlugs.add(p.slug);
    }
  }
  const early = snapshot.protocols
    .filter((p) => isRankable(p) && p.tvl_usd < snapshot.floor_usd && !chosenSlugs.has(p.slug))
    .sort((a: Protocol, b: Protocol) => b.tvl_usd - a.tvl_usd || compareSlug(a.slug, b.slug));
  for (const p of early) {
    if (chosen.length >= BOARD_SIZE) break;
    chosen.push(p);
  }

  const rows: Row[] = [];
  for (const p of chosen) {
    const baseMultiple = multipleFor(p.category);
    const momentum = momentumOf(p);
    const ageFactor = ageFactorOf(p, asOf);
    const implied = impliedValue(p, baseMultiple, momentum, ageFactor);
    rows.push({
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      base_multiple: baseMultiple,
      momentum: momentum,
      age_factor: ageFactor,
      implied_value_usd: implied,
      farm_steps: farmStepsFor(p.name, p.category, p.tvl_usd),
    });
  }

  rows.sort((a: Row, b: Row) => {
    if (b.implied_value_usd !== a.implied_value_usd) return b.implied_value_usd - a.implied_value_usd;
    if (a.slug < b.slug) return -1;
    if (a.slug > b.slug) return 1;
    return 0;
  });
  for (let i: number = 0; i < rows.length; i += 1) rows[i]!.rank = i + 1;

  const categoryMultiples: Record<string, number> = {};
  for (const r of rows) {
    const key = r.category === null ? '__uncategorized__' : r.category;
    if (!Object.prototype.hasOwnProperty.call(categoryMultiples, key)) categoryMultiples[key] = r.base_multiple;
  }

  const model: RadarModel = {
    global_median_multiple: globalMedianMultiple,
    category_multiples: categoryMultiples,
    formula:
      'implied_value_usd = round(tvl_usd * base_multiple * momentum * age_factor); ' +
      'base_multiple is the median mcap_usd/tvl_usd of the category\'s tokened protocols with tvl above zero, ' +
      'falling back to the global median when the category has fewer than three such peers; ' +
      'momentum is clamp(1 + clamp(change_7d, -30, 40) / 100, 0.7, 1.4), or 1 when change_7d is null; ' +
      'age_factor is 1 + min(days_since_listed, 1095) / 1095 * 0.25, or 1 when listed_at is null.',
  };

  return { rows, model };
}

export function dataScript(board: Board): string {
  const payload = { rows: board.rows, model: board.model };
  return `window.RADAR_DATA = ${JSON.stringify(payload)};\n`;
}

export function boardIssue(board: Board | Row[], snapshot?: Snapshot): string | null {
  const rows: Row[] = Array.isArray(board) ? (board as Row[]) : board.rows;
  if (rows === null || rows === undefined || !Array.isArray(rows)) return 'the board holds no rows';
  if (rows.length !== 200) return `the board holds ${rows.length} rows, expected 200`;
  const watchlist = snapshot === null || snapshot === undefined ? null : snapshot.watchlist;
  if (watchlist !== null) {
    const missing = watchlist.filter((slug: string) => !rows.some((r: Row) => r.slug === slug));
    if (missing.length > 0) return `the board is missing ${missing.length} watchlist slugs, first of them ${missing[0]}`;
  }
  const ranks: number[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.slug)) return `the board carries ${r.slug} twice`;
    seen.add(r.slug);
    if (watchlist !== null && !watchlist.includes(r.slug)) {
      const protocol = snapshot === null || snapshot === undefined ? undefined : snapshot.protocols.find((p: Protocol) => p.slug === r.slug);
      if (protocol === undefined) return `non-watchlist row ${r.slug} is not in the snapshot`;
      if (!isRankable(protocol)) return `non-watchlist row ${r.slug} is not rankable`;
    }
    if (typeof r.rank !== 'number' || !Number.isInteger(r.rank) || r.rank < 1) return `row ${r.slug} carries rank ${String(r.rank)}, expected a positive whole number`;
    ranks.push(r.rank);
  }
  const sortedRanks = [...ranks].sort((a: number, b: number) => a - b);
  for (let i: number = 0; i < sortedRanks.length; i += 1) {
    if (sortedRanks[i] !== i + 1) return `the board's ranks are not exactly 1 to ${rows.length}`;
  }
  let previous: number | null = null;
  for (const r of [...rows].sort((a: Row, b: Row) => a.rank - b.rank)) {
    if (typeof r.implied_value_usd !== 'number' || !Number.isInteger(r.implied_value_usd) || r.implied_value_usd < 1) {
      return `row ${r.slug} carries implied value ${String(r.implied_value_usd)}, expected a positive whole number of dollars`;
    }
    if (previous !== null && r.implied_value_usd > previous) return `the board rises as rank ascends at row ${r.slug}`;
    previous = r.implied_value_usd;
  }
  for (const r of rows) {
    const steps = r.farm_steps;
    if (steps === null || steps === undefined || !Array.isArray(steps)) return `row ${r.slug} carries no farm steps`;
    if (steps.length < 3 || steps.length > 12) return `row ${r.slug} carries ${steps.length} farm steps, expected 3 to 12`;
    for (const s of steps) {
      if (typeof s !== 'string') return `row ${r.slug} carries a farm step that is not a string`;
      const trimmed = s.trim();
      if (trimmed.length < 20 || trimmed.length > 600) return `row ${r.slug} carries a farm step of ${trimmed.length} characters, expected 20 to 600`;
    }
  }
  return null;
}
