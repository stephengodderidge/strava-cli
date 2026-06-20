/**
 * Authentication: persisted tokens, transparent refresh, and a one-time
 * interactive OAuth login using a short-lived loopback HTTP server.
 *
 * Token resolution precedence for normal commands:
 *   1. A still-valid cached access token (config file).
 *   2. Refresh, if a refresh token + client credentials are available.
 *   3. A directly-supplied access token (STRAVA_ACCESS_TOKEN), used as-is.
 */

import http from 'node:http';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { URL } from 'node:url';

import {
  DEFAULT_SCOPES,
  STRAVA_OAUTH_AUTHORIZE,
  STRAVA_OAUTH_TOKEN,
  configDir,
  ensureDir,
  oauthPort,
  readCredentials,
  tokenFilePath,
} from './config.js';
import { AppError } from './output.js';
import type { TokenSet } from './types.js';

const EXPIRY_SKEW_SECONDS = 120;

export function loadTokens(): TokenSet | null {
  const file = tokenFilePath();
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as TokenSet;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: TokenSet): void {
  ensureDir(configDir());
  fs.writeFileSync(tokenFilePath(), JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

export function clearTokens(): boolean {
  const file = tokenFilePath();
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file);
  return true;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** POST application/x-www-form-urlencoded to the Strava OAuth token endpoint. */
async function postToken(params: Record<string, string>): Promise<TokenSet> {
  let res: Response;
  try {
    res = await fetch(STRAVA_OAUTH_TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
  } catch (err) {
    throw new AppError('network', `Failed to reach Strava OAuth endpoint: ${(err as Error).message}`);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new AppError('auth', `OAuth token request failed (HTTP ${res.status}).`, {
      hint: 'Verify STRAVA_CLIENT_ID/STRAVA_CLIENT_SECRET and that your refresh token is valid.',
      details: safeJson(text),
    });
  }
  const body = safeJson(text) as Partial<TokenSet>;
  if (!body || !body.access_token || !body.refresh_token || !body.expires_at) {
    throw new AppError('auth', 'OAuth token response was missing expected fields.', {
      details: body,
    });
  }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: body.expires_at,
    token_type: body.token_type,
    scope: body.scope,
  };
}

async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<TokenSet> {
  return postToken({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

/** Resolve a usable access token, refreshing transparently when possible. */
export async function ensureAccessToken(): Promise<string> {
  const creds = readCredentials();
  const fileTokens = loadTokens();
  const refreshToken = creds.envRefreshToken ?? fileTokens?.refresh_token;
  const canRefresh = Boolean(refreshToken && creds.clientId && creds.clientSecret);

  if (fileTokens && fileTokens.expires_at - EXPIRY_SKEW_SECONDS > nowSeconds()) {
    return fileTokens.access_token;
  }

  if (canRefresh) {
    const refreshed = await refreshAccessToken(
      creds.clientId!,
      creds.clientSecret!,
      refreshToken!,
    );
    saveTokens(refreshed);
    return refreshed.access_token;
  }

  if (creds.envAccessToken) return creds.envAccessToken;
  if (fileTokens?.access_token) return fileTokens.access_token;

  throw new AppError('auth', 'Not authenticated.', {
    hint: 'Run `strava auth login`, or set STRAVA_REFRESH_TOKEN together with STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET.',
  });
}

/**
 * Force a token refresh regardless of the cached token's expiry. Used by the
 * client to recover from a 401 (e.g. a revoked token). Returns the new access
 * token, or null if refreshing is not possible (no refresh token / credentials).
 */
export async function forceRefresh(): Promise<string | null> {
  const creds = readCredentials();
  const fileTokens = loadTokens();
  const refreshToken = creds.envRefreshToken ?? fileTokens?.refresh_token;
  if (!(refreshToken && creds.clientId && creds.clientSecret)) return null;
  const refreshed = await refreshAccessToken(creds.clientId, creds.clientSecret, refreshToken);
  saveTokens(refreshed);
  return refreshed.access_token;
}

export interface AuthStatus {
  authenticated: boolean;
  source: 'config-file' | 'env-refresh-token' | 'env-access-token' | 'none';
  expires_at?: number;
  expires_in_seconds?: number;
  scope?: string;
  can_refresh: boolean;
}

export function authStatus(): AuthStatus {
  const creds = readCredentials();
  const fileTokens = loadTokens();
  const canRefresh = Boolean(
    (creds.envRefreshToken ?? fileTokens?.refresh_token) && creds.clientId && creds.clientSecret,
  );

  if (fileTokens) {
    return {
      authenticated: true,
      source: 'config-file',
      expires_at: fileTokens.expires_at,
      expires_in_seconds: fileTokens.expires_at - nowSeconds(),
      scope: fileTokens.scope,
      can_refresh: canRefresh,
    };
  }
  if (creds.envRefreshToken) {
    return { authenticated: true, source: 'env-refresh-token', can_refresh: canRefresh };
  }
  if (creds.envAccessToken) {
    return { authenticated: true, source: 'env-access-token', can_refresh: false };
  }
  return { authenticated: false, source: 'none', can_refresh: false };
}

export interface LoginResult {
  scope: string;
  expires_at: number;
}

/** Run the interactive authorization-code flow via a loopback redirect. */
export async function login(scopes: string = DEFAULT_SCOPES): Promise<LoginResult> {
  const creds = readCredentials();
  if (!creds.clientId || !creds.clientSecret) {
    throw new AppError('config', 'Missing Strava app credentials.', {
      hint: 'Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET (see .env.example). Create an app at https://www.strava.com/settings/api',
    });
  }

  const port = oauthPort();
  const redirectUri = `http://localhost:${port}/callback`;
  const authorizeUrl = new URL(STRAVA_OAUTH_AUTHORIZE);
  authorizeUrl.searchParams.set('client_id', creds.clientId);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('approval_prompt', 'auto');
  authorizeUrl.searchParams.set('scope', scopes);

  const code = await captureAuthCode(port, authorizeUrl.toString());

  const tokens = await postToken({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: 'authorization_code',
    code,
  });
  saveTokens(tokens);
  return { scope: tokens.scope ?? scopes, expires_at: tokens.expires_at };
}

/** Start a one-request loopback server, open the browser, and resolve the code. */
function captureAuthCode(port: number, authorizeUrl: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url ?? '/', `http://localhost:${port}`);
      if (reqUrl.pathname !== '/callback') {
        res.writeHead(404).end('Not found');
        return;
      }
      const error = reqUrl.searchParams.get('error');
      const code = reqUrl.searchParams.get('code');
      res.writeHead(200, { 'content-type': 'text/html' });
      if (error || !code) {
        res.end(htmlPage('Authorization failed', `You can close this tab. (${error ?? 'no code returned'})`));
        cleanup();
        reject(new AppError('auth', `Authorization was denied or failed: ${error ?? 'no code'}`));
        return;
      }
      res.end(htmlPage('Authorization complete', 'You can close this tab and return to the terminal.'));
      cleanup();
      resolve(code);
    });

    const timeout = setTimeout(() => {
      cleanup();
      reject(new AppError('auth', 'Timed out waiting for authorization (5 minutes).'));
    }, 5 * 60 * 1000);

    function cleanup(): void {
      clearTimeout(timeout);
      server.close();
    }

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(
        new AppError('network', `Could not start loopback server on port ${port}: ${err.message}`, {
          hint: 'Set STRAVA_OAUTH_PORT to a free port, and ensure your Strava app callback domain is "localhost".',
        }),
      );
    });

    server.listen(port, '127.0.0.1', () => {
      process.stderr.write(`Opening browser to authorize. If it does not open, visit:\n${authorizeUrl}\n`);
      openBrowser(authorizeUrl);
    });
  });
}

/** Best-effort cross-platform browser launch. */
function openBrowser(url: string): void {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    // Non-fatal: the URL was already printed for manual use.
  }
}

function htmlPage(title: string, message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:system-ui;max-width:32rem;margin:4rem auto;text-align:center"><h1>${title}</h1><p>${message}</p></body></html>`;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
