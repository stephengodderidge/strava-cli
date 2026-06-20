import { parseCommand } from '../lib/args.js';
import { TTL } from '../lib/cache.js';
import { AppError, ExitCode } from '../lib/output.js';
import type { AthleteGear } from '../lib/types.js';
import { makeClient, output } from './_shared.js';

const HELP = `strava gear — show gear (bike/shoe) detail by id

Usage:
  strava gear <id> [--format json|table]

Notes:
  Gear ids (e.g. b1234567, g7654321) appear on the profile and on activities.
`;

export async function run(args: string[]): Promise<number> {
  const { positionals, global, helpRequested } = parseCommand(args);
  if (helpRequested) {
    process.stdout.write(HELP);
    return ExitCode.Ok;
  }

  const id = positionals[0];
  if (!id) {
    throw new AppError('usage', 'Missing gear id.', { hint: 'Usage: strava gear <id>' });
  }

  const client = makeClient(global);
  const gear = await client.get<AthleteGear>(`gear/${id}`, { ttl: TTL.immutable });
  output(gear, global, client);
  return ExitCode.Ok;
}
