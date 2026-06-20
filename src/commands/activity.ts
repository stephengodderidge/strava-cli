import { parseCommand, type OptionMap } from '../lib/args.js';
import { TTL } from '../lib/cache.js';
import { AppError, ExitCode } from '../lib/output.js';
import type { ActivityZone, DetailedActivity, Lap } from '../lib/types.js';
import { makeClient, output } from './_shared.js';

const OPTIONS: OptionMap = {
  laps: { type: 'boolean' },
  zones: { type: 'boolean' },
};

const HELP = `strava activity — show a single activity by id

Usage:
  strava activity <id> [--laps] [--zones] [--format json|table]

Options:
  --laps    Include per-lap splits
  --zones   Include heart-rate / power zone distribution
`;

export async function run(args: string[]): Promise<number> {
  const { values, positionals, global, helpRequested } = parseCommand(args, OPTIONS);
  if (helpRequested) {
    process.stdout.write(HELP);
    return ExitCode.Ok;
  }

  const id = positionals[0];
  if (!id) {
    throw new AppError('usage', 'Missing activity id.', { hint: 'Usage: strava activity <id>' });
  }

  const client = makeClient(global);
  const wantLaps = Boolean(values.laps);
  const wantZones = Boolean(values.zones);

  const detail = await client.get<DetailedActivity>(`activities/${id}`, { ttl: TTL.immutable });

  if (!wantLaps && !wantZones) {
    output(detail, global, client);
    return ExitCode.Ok;
  }

  const result: DetailedActivity & { zones?: ActivityZone[] } = { ...detail };
  if (wantLaps) {
    result.laps = await client.get<Lap[]>(`activities/${id}/laps`, { ttl: TTL.immutable });
  }
  if (wantZones) {
    result.zones = await client.get<ActivityZone[]>(`activities/${id}/zones`, {
      ttl: TTL.immutable,
    });
  }
  output(result, global, client);
  return ExitCode.Ok;
}
