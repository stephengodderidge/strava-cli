import { parseCommand } from '../lib/args.js';
import { cacheInfo, clearCache } from '../lib/cache.js';
import { AppError, ExitCode } from '../lib/output.js';
import { output } from './_shared.js';

const HELP = `strava cache — manage the local response cache

Usage:
  strava cache info     Show cache location, entry count, and size
  strava cache clear    Delete all cached responses
`;

export async function run(args: string[]): Promise<number> {
  const { positionals, global, helpRequested } = parseCommand(args);
  if (helpRequested) {
    process.stdout.write(HELP);
    return ExitCode.Ok;
  }

  const sub = positionals[0] ?? 'info';
  switch (sub) {
    case 'info':
      output(cacheInfo(), global);
      return ExitCode.Ok;
    case 'clear': {
      const removed = clearCache();
      output({ cleared: removed }, global);
      return ExitCode.Ok;
    }
    default:
      throw new AppError('usage', `Unknown cache subcommand "${sub}".`, {
        hint: 'Use "strava cache info" or "strava cache clear".',
      });
  }
}
