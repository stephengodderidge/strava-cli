import { optionalInt, parseCommand, toUnixSeconds, type OptionMap } from '../lib/args.js';
import { TTL } from '../lib/cache.js';
import { AppError, ExitCode } from '../lib/output.js';
import type { SummaryActivity } from '../lib/types.js';
import { makeClient, output } from './_shared.js';

const OPTIONS: OptionMap = {
  after: { type: 'string' },
  before: { type: 'string' },
  page: { type: 'string' },
  'per-page': { type: 'string' },
  limit: { type: 'string' },
  type: { type: 'string' },
};

const HELP = `strava activities — list the athlete's activities

Usage:
  strava activities [options]

Options:
  --after <date>        Only activities after this date (YYYY-MM-DD, ISO, or unix)
  --before <date>       Only activities before this date
  --page <n>            Page number (default 1)
  --per-page <n>        Items per page (default 30, max 200)
  --limit <n>           Cap the number of returned activities (client-side)
  --type <sport>        Filter by sport type (e.g. Run, Ride, Swim)
  --fields <a,b,c>      Keep only these top-level fields (e.g. id,name,distance)
  --format <json|table> Output format (default: json)
  --no-cache            Bypass the local response cache
`;

const MAX_PER_PAGE = 200;

export async function run(args: string[]): Promise<number> {
  const { values, global, helpRequested } = parseCommand(args, OPTIONS);
  if (helpRequested) {
    process.stdout.write(HELP);
    return ExitCode.Ok;
  }

  const limit = optionalInt(values, 'limit');
  let perPage = optionalInt(values, 'per-page');
  if (perPage === undefined) {
    perPage = limit !== undefined ? Math.min(limit, MAX_PER_PAGE) : 30;
  }
  if (perPage < 1 || perPage > MAX_PER_PAGE) {
    throw new AppError('usage', `--per-page must be between 1 and ${MAX_PER_PAGE}.`);
  }

  const query: Record<string, string | number | undefined> = {
    page: optionalInt(values, 'page'),
    per_page: perPage,
  };
  if (typeof values.after === 'string') query.after = toUnixSeconds(values.after, 'after');
  if (typeof values.before === 'string') query.before = toUnixSeconds(values.before, 'before');

  const client = makeClient(global);
  let activities = await client.get<SummaryActivity[]>('athlete/activities', {
    query,
    ttl: TTL.volatile,
  });

  if (typeof values.type === 'string') {
    const wanted = values.type.toLowerCase();
    activities = activities.filter(
      (a) => a.sport_type?.toLowerCase() === wanted || a.type?.toLowerCase() === wanted,
    );
  }
  if (limit !== undefined) activities = activities.slice(0, limit);

  output(activities, global, client);
  return ExitCode.Ok;
}
