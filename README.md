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
- Your own free Strava API application — see [Getting started](#getting-started).
  This CLI is **bring-your-own-app**: it never ships shared credentials.

## Install

```bash
npm install -g strava-cli
```

This puts a `strava` command on your PATH. Verify with:

```bash
strava --version
```

> Not yet published to npm? Install it from a local checkout instead — it behaves
> exactly like a global install:
>
> ```bash
> git clone <repo-url> && cd strava-cli
> npm install            # builds dist/ automatically (via the prepare hook)
> npm install -g .       # installs the global `strava` command
> ```
>
> For active development, `npm link` is handier (symlinks your working copy), and
> you can always run commands directly as `node dist/cli.js <command>`.

## Getting started

**1. Register a Strava API application** (one-time, web-only — Strava has no API
to automate this). Go to <https://www.strava.com/settings/api> and:

- give it any name and website (e.g. `http://localhost`);
- set **Authorization Callback Domain** to exactly `localhost`;
- keep the page open — you'll copy the **Client ID** and **Client Secret** next.

**2. Configure the app and log in.** This opens the settings page, prompts you to
paste the Client ID and Client Secret, then opens your browser to authorize:

```bash
strava auth setup
```

**3. Confirm you're authenticated:**

```bash
strava auth status
```

**4. Query your data:**

```bash
strava profile
strava summary --days 28
strava activities --type Run --limit 10 --format table
strava stats
```

That's it — access tokens refresh automatically, so steps 1–2 are one-time.

> If `strava` isn't found right after installing, open a **new** terminal so it
> picks up the updated PATH.

## Authentication & configuration

`strava auth setup` is the easy path, but you have options:

```bash
strava auth setup                                                # interactive
strava auth setup --client-id 12345 --client-secret <secret>     # scriptable
strava auth setup --client-id 12345 --client-secret <secret> --no-login
strava auth login      # (re-)run the browser login if credentials already exist
strava auth status     # show the configured app + token expiry
strava auth logout     # delete stored tokens
```

Alternatively, provide credentials via the environment — copy `.env.example` to
`.env` (auto-loaded from the working directory) or export them in your shell:

```ini
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=your_client_secret
# Optional (headless/agent): supply a refresh token directly instead of `auth login`
STRAVA_REFRESH_TOKEN=...
```

App credentials resolve **env first** (`STRAVA_CLIENT_ID`/`STRAVA_CLIENT_SECRET`,
including `.env`), then the file written by `auth setup`. Token precedence at call
time: a valid cached token → refresh (refresh token + client id/secret) → a
directly-supplied `STRAVA_ACCESS_TOKEN`. For headless/agent setups you can skip
the browser entirely by setting `STRAVA_REFRESH_TOKEN` + `STRAVA_CLIENT_ID` +
`STRAVA_CLIENT_SECRET`.

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
