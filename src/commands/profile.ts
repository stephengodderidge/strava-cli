import { parseCommand } from '../lib/args.js';
import { TTL } from '../lib/cache.js';
import { ExitCode } from '../lib/output.js';
import type { DetailedAthlete } from '../lib/types.js';
import { makeClient, output } from './_shared.js';

const HELP = `strava profile — show the authenticated athlete's profile

Usage:
  strava profile [--format json|table] [--no-cache]
`;

export async function run(args: string[]): Promise<number> {
  const { global, helpRequested } = parseCommand(args);
  if (helpRequested) {
    process.stdout.write(HELP);
    return ExitCode.Ok;
  }
  const client = makeClient(global);
  const athlete = await client.get<DetailedAthlete>('athlete', { ttl: TTL.profile });
  output(athlete, global, client);
  return ExitCode.Ok;
}
