import { parseCommand } from '../lib/args.js';
import { TTL } from '../lib/cache.js';
import { ExitCode } from '../lib/output.js';
import type { AthleteZones } from '../lib/types.js';
import { makeClient, output } from './_shared.js';

const HELP = `strava zones — show the athlete's heart-rate / power zone definitions

Usage:
  strava zones [--format json|table]

Notes:
  Requires the profile:read_all scope; zones may be empty if not configured.
`;

export async function run(args: string[]): Promise<number> {
  const { global, helpRequested } = parseCommand(args);
  if (helpRequested) {
    process.stdout.write(HELP);
    return ExitCode.Ok;
  }
  const client = makeClient(global);
  const zones = await client.get<AthleteZones>('athlete/zones', { ttl: TTL.profile });
  output(zones, global, client);
  return ExitCode.Ok;
}
