import { optionalInt, parseCommand, type OptionMap } from '../lib/args.js';
import { TTL } from '../lib/cache.js';
import { AppError, ExitCode } from '../lib/output.js';
import type { StravaClient } from '../lib/client.js';
import type { SummaryActivity } from '../lib/types.js';
import { makeClient, output } from './_shared.js';

const OPTIONS: OptionMap = {
  days: { type: 'string' },
};

const HELP = `strava summary — aggregate recent training into a compact summary

Usage:
  strava summary [--days <n>] [--format json|table]

Options:
  --days <n>   Look-back window in days (default 28)

Produces totals overall and per sport, plus the most recent activities — a
compact shape well suited for answering questions about an athlete.
`;

const PER_PAGE = 200;
const MAX_PAGES = 5; // bound the work: up to 1000 activities in the window

interface SportTotals {
  count: number;
  distance_m: number;
  moving_time_s: number;
  elapsed_time_s: number;
  elevation_gain_m: number;
}

function emptyTotals(): SportTotals {
  return { count: 0, distance_m: 0, moving_time_s: 0, elapsed_time_s: 0, elevation_gain_m: 0 };
}

function add(totals: SportTotals, a: SummaryActivity): void {
  totals.count += 1;
  totals.distance_m += a.distance ?? 0;
  totals.moving_time_s += a.moving_time ?? 0;
  totals.elapsed_time_s += a.elapsed_time ?? 0;
  totals.elevation_gain_m += a.total_elevation_gain ?? 0;
}

export async function run(args: string[]): Promise<number> {
  const { values, global, helpRequested } = parseCommand(args, OPTIONS);
  if (helpRequested) {
    process.stdout.write(HELP);
    return ExitCode.Ok;
  }

  const days = optionalInt(values, 'days') ?? 28;
  if (days < 1) throw new AppError('usage', '--days must be a positive integer.');

  const until = new Date();
  const since = new Date(until.getTime() - days * 86_400_000);
  const afterUnix = Math.floor(since.getTime() / 1000);

  const client = makeClient(global);
  const activities = await fetchWindow(client, afterUnix);

  const overall = emptyTotals();
  const bySport: Record<string, SportTotals> = {};
  for (const a of activities) {
    add(overall, a);
    const sport = a.sport_type ?? a.type ?? 'Unknown';
    (bySport[sport] ??= emptyTotals());
    add(bySport[sport]!, a);
  }

  const recent = [...activities]
    .sort((a, b) => Date.parse(b.start_date) - Date.parse(a.start_date))
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      name: a.name,
      sport_type: a.sport_type,
      start_date_local: a.start_date_local,
      distance_m: a.distance,
      moving_time_s: a.moving_time,
    }));

  const summary = {
    period: {
      days,
      since: since.toISOString(),
      until: until.toISOString(),
    },
    totals: overall,
    by_sport: bySport,
    recent_activities: recent,
  };

  output(summary, global, client);
  return ExitCode.Ok;
}

/** Page through the activity list within the window, bounded by MAX_PAGES. */
async function fetchWindow(client: StravaClient, afterUnix: number): Promise<SummaryActivity[]> {
  const all: SummaryActivity[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await client.get<SummaryActivity[]>('athlete/activities', {
      query: { after: afterUnix, page, per_page: PER_PAGE },
      ttl: TTL.volatile,
    });
    all.push(...batch);
    if (batch.length < PER_PAGE) break;
  }
  return all;
}
