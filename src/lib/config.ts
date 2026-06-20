/**
 * Configuration and path resolution.
 *
 * Responsibilities:
 *  - Locate config/token and cache directories in an OS-appropriate, override-able way.
 *  - Load a local `.env` file (no external dependency) if present.
 *  - Resolve Strava credentials with a clear precedence: explicit env > .env > config file.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const APP_DIR_NAME = 'strava-cli';

let envLoaded = false;

/**
 * Load `.env` (and `.env.local`) from the current working directory into
 * process.env, without overwriting variables that are already set. Intentionally
 * tiny: supports `KEY=value`, `#` comments, and surrounding quotes.
 */
export function loadDotEnv(cwd: string = process.cwd()): void {
  if (envLoaded) return;
  envLoaded = true;
  for (const file of ['.env', '.env.local']) {
    const full = path.join(cwd, file);
    if (!fs.existsSync(full)) continue;
    const content = fs.readFileSync(full, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (!key || key in process.env) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

/** Test-only seam: reset the dotenv load guard so a fresh `.env` can be loaded. */
export function resetDotEnvForTests(): void {
  envLoaded = false;
}

/** Directory for config + persisted tokens (override: STRAVA_CONFIG_DIR). */
export function configDir(): string {
  const override = process.env.STRAVA_CONFIG_DIR;
  if (override) return override;
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(base, APP_DIR_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', APP_DIR_NAME);
  }
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, APP_DIR_NAME);
}

/** Directory for the on-disk response cache (override: STRAVA_CACHE_DIR). */
export function cacheDir(): string {
  const override = process.env.STRAVA_CACHE_DIR;
  if (override) return override;
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, APP_DIR_NAME, 'cache');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', APP_DIR_NAME);
  }
  const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  return path.join(base, APP_DIR_NAME);
}

/** Path to the persisted token file. */
export function tokenFilePath(): string {
  return path.join(configDir(), 'tokens.json');
}

/** Path to the persisted app-credentials file (client id/secret). */
export function credentialsFilePath(): string {
  return path.join(configDir(), 'credentials.json');
}

interface StoredCredentials {
  clientId?: string;
  clientSecret?: string;
}

function readStoredCredentials(): StoredCredentials {
  const file = credentialsFilePath();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as StoredCredentials;
  } catch {
    return {};
  }
}

/** Persist app credentials to the config dir with restrictive permissions. */
export function saveCredentials(clientId: string, clientSecret: string): void {
  ensureDir(configDir());
  fs.writeFileSync(
    credentialsFilePath(),
    JSON.stringify({ clientId, clientSecret }, null, 2),
    { mode: 0o600 },
  );
}

export interface Credentials {
  clientId?: string;
  clientSecret?: string;
  /** Token supplied directly via env, if any. */
  envRefreshToken?: string;
  envAccessToken?: string;
}

/**
 * Read app credentials and any directly-supplied tokens. App credentials come
 * from the environment first (env > .env), then fall back to the stored
 * credentials file written by `strava auth setup`.
 */
export function readCredentials(): Credentials {
  loadDotEnv();
  const stored = readStoredCredentials();
  return {
    clientId: process.env.STRAVA_CLIENT_ID ?? stored.clientId,
    clientSecret: process.env.STRAVA_CLIENT_SECRET ?? stored.clientSecret,
    envRefreshToken: process.env.STRAVA_REFRESH_TOKEN,
    envAccessToken: process.env.STRAVA_ACCESS_TOKEN,
  };
}

/** Loopback port used by the one-time OAuth login flow. */
export function oauthPort(): number {
  const raw = process.env.STRAVA_OAUTH_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 41734;
}

/** Ensure a directory exists (recursive, idempotent). */
export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
export const STRAVA_API_SETTINGS_URL = 'https://www.strava.com/settings/api';
export const STRAVA_OAUTH_AUTHORIZE = 'https://www.strava.com/oauth/authorize';
export const STRAVA_OAUTH_TOKEN = 'https://www.strava.com/oauth/token';
export const DEFAULT_SCOPES = 'read,activity:read_all,profile:read_all';
