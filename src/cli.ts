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
  strava help [command]              Show help (optionally for one command)
  strava <command> --help            Show options for a specific command

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

First-time setup:
  Run \`strava auth setup\` once. It walks you through registering a Strava API
  app (bring-your-own-app) and logs you in. Check state with \`strava auth status\`.

Output contract (for scripts and agents):
  • stdout = result data only. JSON by default (pretty-printed); pass
    --format table for a human view. Fields are passed through from the Strava
    API, so unknown/extra fields may appear.
  • stderr = diagnostics and errors as {"error":{"code","message","hint"?}}.
  • Exit codes: 0 ok, 1 generic/API error, 2 usage, 3 auth, 4 rate-limited,
    5 not-found. Branch on the exit code, not on stderr text.

Data conventions:
  • Distances/elevation in meters, durations in seconds, speeds in meters/second.
  • Timestamps are ISO-8601 (start_date is UTC; start_date_local is the
    athlete's local time).
  • Date filters (--after/--before) accept YYYY-MM-DD, full ISO-8601, or a unix
    timestamp. IDs (activity, gear) are taken from prior responses.

Examples:
  strava auth setup
  strava profile
  strava activities --after 2024-01-01 --type Run --limit 10
  strava activity 1234567890 --laps --zones
  strava stats
  strava summary --days 28               # compact recent-training overview
  strava activities --format table       # human-friendly view
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

  // `strava help [command]` — top-level help, or delegate to a command's --help.
  if (first === 'help') {
    const target = argv[1];
    if (target) {
      if (!COMMANDS[target]) {
        return reportError(
          new AppError('usage', `Unknown command "${target}".`, {
            hint: 'Run `strava help` to see available commands.',
          }),
        );
      }
      const mod = await COMMANDS[target]();
      return await mod.run(['--help']);
    }
    process.stdout.write(TOP_HELP);
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
