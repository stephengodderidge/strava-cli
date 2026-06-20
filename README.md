# strava-cli

A fast, deterministic command-line tool for fetching a **single athlete's**
Strava data. Designed to be called by both humans and **AI agents** from a
terminal: stable JSON output, predictable flags, machine-readable errors, and
documented exit codes.

- **Low latency** — minimal dependencies, native `fetch`, lazily-loaded
  subcommands, and an on-disk cache for immutable/slow-changing data.
- **Deterministic** — stdout is data only; errors go to stderr as a JSON
  envelope; exit codes are stable.
- **Cross-platform** — Windows, macOS, and Linux (Node.js ≥ 18).

## Requirements

- Node.js **18+** (uses the global `fetch` and `node:util` `parseArgs`).
- A Strava API application (free): https://www.strava.com/settings/api
  - Note the **Client ID** and **Client Secret**.
  - Set **Authorization Callback Domain** to `localhost`.

## Install

```bash
npm install
npm run build      # compiles TypeScript -> dist/
npm link           # optional: exposes a global `strava` command
```

Without `npm link`, run it as `node dist/cli.js <command>`.

## Configure credentials

First, register a Strava API application (one-time, web-only — Strava has no API
to automate this): https://www.strava.com/settings/api. Set the **Authorization
Callback Domain** to `localhost`, and note the **Client ID** and **Client Secret**.

The easiest way to store them is the guided setup command, which opens that page,
prompts for the two values, saves them under your OS config dir, and logs you in:

```bash
strava auth setup
```

Alternatively, provide them via the environment — copy `.env.example` to `.env`
(auto-loaded from the working directory) or export them in your shell:

```ini
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=your_client_secret
# Optional (headless/agent): supply a refresh token directly instead of `auth login`
STRAVA_REFRESH_TOKEN=...
```

App credentials are resolved env first (`STRAVA_CLIENT_ID`/`STRAVA_CLIENT_SECRET`,
including `.env`), then the file written by `auth setup`. Token precedence at call
time: a valid cached token → refresh (refresh token + client id/secret) → a
directly-supplied `STRAVA_ACCESS_TOKEN`.

## Authenticate

Recommended — guided, one-time setup (enter credentials + browser login):

```bash
strava auth setup            # prompts for Client ID/Secret, then logs in
strava auth setup --no-login # just save credentials
```

Or, if credentials are already in the environment, just log in (opens a browser,
captures the redirect on a loopback server, stores tokens under your OS config dir):

```bash
strava auth login
strava auth status
strava auth logout
```

For headless/agent setups, skip the browser entirely: set
`STRAVA_REFRESH_TOKEN` + `STRAVA_CLIENT_ID` + `STRAVA_CLIENT_SECRET`, and the CLI
refreshes access tokens automatically.

## Commands

| Command | Description |
| --- | --- |
| `strava profile` | Authenticated athlete's profile |
| `strava activities [opts]` | List activities (filters + pagination) |
| `strava activity <id> [--laps] [--zones]` | Single activity detail |
| `strava stats [--athlete-id <id>]` | Recent / YTD / all-time totals |
| `strava zones` | Heart-rate / power zone definitions |
| `strava gear <id>` | Gear (bike/shoe) detail |
| `strava summary [--days <n>]` | Aggregated recent-training summary |
| `strava cache info\|clear` | Manage the local response cache |
| `strava auth setup\|login\|status\|logout` | Authentication |

### `activities` options

```
--after <date>     Only activities after a date (YYYY-MM-DD, ISO, or unix)
--before <date>    Only activities before a date
--page <n>         Page number (default 1)
--per-page <n>     Items per page (default 30, max 200)
--limit <n>        Cap returned activities (client-side)
--type <sport>     Filter by sport (e.g. Run, Ride, Swim)
```

### Global options

```
--format <json|table>   Output format (default: json)
--no-cache              Bypass the local response cache
-v, --verbose           Print rate-limit usage to stderr
-h, --help              Show help (top-level or per command)
--version               Show version
```

## Output & exit-code contract (for agents)

- **stdout**: result data only. JSON by default (`--format table` for humans).
- **stderr**: diagnostics and errors as `{"error":{"code","message","hint"?,"details"?}}`.
- **Units**: raw Strava units are preserved in JSON — distance/elevation in
  **meters**, durations in **seconds**, speed in **m/s**, dates in **ISO-8601**.

| Exit | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Generic / API error |
| `2` | Usage error (bad flags/arguments) |
| `3` | Authentication error |
| `4` | Rate limited (HTTP 429) |
| `5` | Not found (HTTP 404) |

## Examples

```bash
strava profile
strava activities --after 2024-01-01 --type Run --limit 10
strava activity 1234567890 --laps --zones
strava stats
strava summary --days 28          # great for agent Q&A about recent training
strava activities --format table  # human-friendly view
```

## Caching & rate limits

Strava allows **200 requests / 15 min** and **2000 / day**. To stay well within
budget and cut latency on repeat calls, responses are cached on disk by request
URL with volatility-aware TTLs (immutable activity detail caches for days; lists
and stats for minutes). Use `--no-cache` to bypass and `strava cache clear` to
purge. On `429`, the CLI fails fast with exit code `4` and a hint that includes
current usage (from the `X-RateLimit-*` headers).

## Storage locations

| Data | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Tokens/config | `%APPDATA%\strava-cli` | `~/Library/Application Support/strava-cli` | `${XDG_CONFIG_HOME:-~/.config}/strava-cli` |
| Cache | `%LOCALAPPDATA%\strava-cli\cache` | `~/Library/Caches/strava-cli` | `${XDG_CACHE_HOME:-~/.cache}/strava-cli` |

Override with `STRAVA_CONFIG_DIR` / `STRAVA_CACHE_DIR`.

## Development

```bash
npm run build     # tsc -> dist/
npm run dev -- profile   # rebuild and run a command
npm test          # type-check + run the node:test suite
npm run clean     # remove dist/ and dist-test/
```

Tests use the built-in `node:test` runner (no extra dependencies) and stub
`globalThis.fetch`, so the suite is fully offline and deterministic.

## Project layout

```
src/
  cli.ts            # entry: argv parse + lazy command router
  commands/         # one file per command
  lib/
    client.ts       # Strava HTTP client (auth, cache, 429, errors)
    auth.ts         # token store, refresh, OAuth loopback login
    config.ts       # OS paths, .env loader, credential resolution
    cache.ts        # disk cache with volatility-aware TTLs
    output.ts       # JSON/table output, error envelope, exit codes
    args.ts         # shared argument parsing + global flags
    types.ts        # typed Strava response shapes
test/             # node:test unit tests (offline, fetch stubbed)
```

## License

MIT
