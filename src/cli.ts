#!/usr/bin/env node
/**
 * strava — entry point and command router.
 *
 * Subcommands are lazily imported so only the invoked command's code is
 * evaluated, keeping cold-start latency low. Each command module exports
 * `run(args: string[]): Promise<number>` returning a process exit code.
 */

import { loadDotEnv } from './lib/config.js';
import { AppError, ExitCode, reportError } from './lib/output.js';

const VERSION = '0.1.0';

interface CommandModule {
  run(args: string[]): Promise<number>;
}

const COMMANDS: Record<string, () => Promise<CommandModule>> = {
  auth: () => import('./commands/auth.js'),
  profile: () => import('./commands/profile.js'),
  activities: () => import('./commands/activities.js'),
  activity: () => import('./commands/activity.js'),
  stats: () => import('./commands/stats.js'),
  zones: () => import('./commands/zones.js'),
  gear: () => import('./commands/gear.js'),
  summary: () => import('./commands/summary.js'),
  cache: () => import('./commands/cache.js'),
};

const TOP_HELP = `strava — fast, deterministic CLI for a single athlete's Strava data

Usage:
  strava <command> [options]

Commands:
  auth         Authenticate (setup | login | status | logout)
  profile      Show the authenticated athlete's profile
  activities   List activities (date filters, pagination, type filter)
  activity     Show a single activity by id (+ --laps, --zones)
  stats        Show athlete totals (recent / YTD / all-time)
  zones        Show the athlete's heart-rate / power zone definitions
  gear         Show gear (bike/shoe) detail by id
  summary      Aggregate recent training into a compact JSON summary
  cache        Manage the local response cache (info | clear)

Global options:
  --format <json|table>   Output format (default: json)
  --no-cache              Bypass the local response cache
  -v, --verbose           Print rate-limit usage to stderr
  -h, --help              Show help
  --version               Show version

Output contract:
  stdout = data (JSON by default). stderr = errors as {"error":{code,message,hint}}.
  Exit codes: 0 ok, 2 usage, 3 auth, 4 rate-limited, 5 not-found, 1 other.

Examples:
  strava auth setup
  strava profile
  strava activities --after 2024-01-01 --limit 10
  strava activity 1234567890 --laps --zones
  strava summary --days 28
`;

async function main(): Promise<number> {
  loadDotEnv();
  const argv = process.argv.slice(2);
  const first = argv[0];

  if (!first || first === '--help' || first === '-h') {
    process.stdout.write(TOP_HELP);
    return ExitCode.Ok;
  }
  if (first === '--version' || first === '-V') {
    process.stdout.write(`${VERSION}\n`);
    return ExitCode.Ok;
  }

  const loader = COMMANDS[first];
  if (!loader) {
    return reportError(
      new AppError('usage', `Unknown command "${first}".`, {
        hint: 'Run `strava --help` to see available commands.',
      }),
    );
  }

  try {
    const mod = await loader();
    return await mod.run(argv.slice(1));
  } catch (err) {
    return reportError(err);
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.exitCode = reportError(err);
  });
