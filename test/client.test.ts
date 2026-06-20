import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StravaClient } from '../src/lib/client.js';
import { AppError } from '../src/lib/output.js';

const isCode = (code: string) => (e: unknown): e is AppError =>
  e instanceof AppError && e.code === code;

let origFetch: typeof globalThis.fetch;
let tmpCfg: string;
let tmpCache: string;

beforeEach(() => {
  origFetch = globalThis.fetch;
  tmpCfg = fs.mkdtempSync(path.join(os.tmpdir(), 'strava-cfg-'));
  tmpCache = fs.mkdtempSync(path.join(os.tmpdir(), 'strava-cch-'));
  process.env.STRAVA_CONFIG_DIR = tmpCfg;
  process.env.STRAVA_CACHE_DIR = tmpCache;
  // A bare access token (no refresh token / client creds) makes auth fully
  // offline: ensureAccessToken returns it directly and a 401 cannot be retried.
  process.env.STRAVA_ACCESS_TOKEN = 'test-token';
  delete process.env.STRAVA_REFRESH_TOKEN;
  delete process.env.STRAVA_CLIENT_ID;
  delete process.env.STRAVA_CLIENT_SECRET;
});

afterEach(() => {
  globalThis.fetch = origFetch;
  delete process.env.STRAVA_CONFIG_DIR;
  delete process.env.STRAVA_CACHE_DIR;
  delete process.env.STRAVA_ACCESS_TOKEN;
  fs.rmSync(tmpCfg, { recursive: true, force: true });
  fs.rmSync(tmpCache, { recursive: true, force: true });
});

test('get returns parsed JSON and captures rate-limit headers', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ id: 1 }), {
      status: 200,
      headers: { 'x-ratelimit-limit': '200,2000', 'x-ratelimit-usage': '5,50' },
    });
  };
  const client = new StravaClient({ useCache: false });
  const data = await client.get<{ id: number }>('athlete');
  assert.deepEqual(data, { id: 1 });
  assert.equal(calls, 1);
  assert.deepEqual(client.lastRateLimit, {
    limit_15min: 200,
    limit_daily: 2000,
    usage_15min: 5,
    usage_daily: 50,
  });
});

test('404 maps to not_found', async () => {
  globalThis.fetch = async () => new Response('{"message":"Not Found"}', { status: 404 });
  const client = new StravaClient({ useCache: false });
  await assert.rejects(client.get('activities/1'), isCode('not_found'));
});

test('429 maps to rate_limited', async () => {
  globalThis.fetch = async () =>
    new Response('limit', {
      status: 429,
      headers: { 'x-ratelimit-limit': '200,2000', 'x-ratelimit-usage': '200,500' },
    });
  const client = new StravaClient({ useCache: false });
  await assert.rejects(client.get('athlete'), isCode('rate_limited'));
});

test('401 without refresh credentials maps to auth and does not retry', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response('{"message":"Authorization Error"}', { status: 401 });
  };
  const client = new StravaClient({ useCache: false });
  await assert.rejects(client.get('athlete'), isCode('auth'));
  assert.equal(calls, 1);
});

test('a network failure maps to the network code', async () => {
  globalThis.fetch = async () => {
    throw new Error('connection refused');
  };
  const client = new StravaClient({ useCache: false });
  await assert.rejects(client.get('athlete'), isCode('network'));
});

test('a cache hit avoids a second network call', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ n: calls }), { status: 200 });
  };
  const client = new StravaClient({ useCache: true });
  const first = await client.get('athlete', { ttl: 60 });
  const second = await client.get('athlete', { ttl: 60 });
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
});
