import { optionalInt, parseCommand, type OptionMap } from '../lib/args.js';
import { TTL } from '../lib/cache.js';
import { ExitCode } from '../lib/output.js';
import type { AthleteStats, DetailedAthlete } from '../lib/types.js';
import { makeClient, output } from './_shared.js';

const OPTIONS: OptionMap = {
  'athlete-id': { type: 'string' },
};

const HELP = `strava stats — show athlete totals (recent / YTD / all-time)

Usage:
  strava stats [--athlete-id <id>] [--format json|table]

Notes:
  If --athlete-id is omitted, the authenticated athlete's id is used.
`;

export async function run(args: string[]): Promise<number> {
  const { values, global, helpRequested } = parseCommand(args, OPTIONS);
  if (helpRequested) {
    process.stdout.write(HELP);
    return ExitCode.Ok;
  }

  const client = makeClient(global);
  let athleteId = optionalInt(values, 'athlete-id');
  if (athleteId === undefined) {
    const athlete = await client.get<DetailedAthlete>('athlete', { ttl: TTL.profile });
    athleteId = athlete.id;
  }

  const stats = await client.get<AthleteStats>(`athletes/${athleteId}/stats`, {
    ttl: TTL.volatile,
  });
  output(stats, global, client);
  return ExitCode.Ok;
}
