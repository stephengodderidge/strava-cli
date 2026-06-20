import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { cacheInfo, clearCache, readCache, writeCache } from '../src/lib/cache.js';

function withTempCacheDir(fn: () => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strava-cache-'));
  process.env.STRAVA_CACHE_DIR = dir;
  try {
    fn();
  } finally {
    delete process.env.STRAVA_CACHE_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('writeCache/readCache round-trips within TTL', () => {
  withTempCacheDir(() => {
    const url = 'https://example/a';
    assert.equal(readCache(url, 60), null);
    writeCache(url, { v: 1 });
    assert.deepEqual(readCache(url, 60), { v: 1 });
  });
});

test('readCache returns null when TTL is non-positive', () => {
  withTempCacheDir(() => {
    writeCache('https://example/b', { v: 2 });
    assert.equal(readCache('https://example/b', 0), null);
  });
});

test('readCache honors TTL expiry', () => {
  withTempCacheDir(() => {
    const url = 'https://example/c';
    writeCache(url, { v: 3 });
    // Age the entry by rewriting saved_at into the past.
    const dir = process.env.STRAVA_CACHE_DIR!;
    const file = fs.readdirSync(dir).find((f) => f.endsWith('.json'))!;
    const full = path.join(dir, file);
    const entry = JSON.parse(fs.readFileSync(full, 'utf8'));
    entry.saved_at = Math.floor(Date.now() / 1000) - 1000;
    fs.writeFileSync(full, JSON.stringify(entry));
    assert.equal(readCache(url, 60), null);
  });
});

test('cacheInfo and clearCache report and purge entries', () => {
  withTempCacheDir(() => {
    writeCache('https://example/d', { v: 4 });
    writeCache('https://example/e', { v: 5 });
    const info = cacheInfo();
    assert.equal(info.entries, 2);
    assert.ok(info.bytes > 0);
    assert.equal(clearCache(), 2);
    assert.equal(cacheInfo().entries, 0);
  });
});

test('cacheInfo is empty when the cache dir does not exist', () => {
  const dir = path.join(os.tmpdir(), `strava-missing-${Date.now()}`);
  process.env.STRAVA_CACHE_DIR = dir;
  try {
    const info = cacheInfo();
    assert.equal(info.entries, 0);
    assert.equal(info.bytes, 0);
    assert.equal(clearCache(), 0);
  } finally {
    delete process.env.STRAVA_CACHE_DIR;
  }
});
