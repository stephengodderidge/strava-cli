/**
 * Simple, dependency-free on-disk response cache.
 *
 * Entries are keyed by a hash of the full request URL and stored as JSON files
 * under the OS cache directory. Each caller supplies a TTL appropriate for the
 * resource (immutable activity detail caches long; mutable lists cache briefly).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { cacheDir, ensureDir } from './config.js';

interface CacheEntry<T> {
  url: string;
  saved_at: number; // unix seconds
  data: T;
}

function keyToFile(url: string): string {
  const hash = crypto.createHash('sha1').update(url).digest('hex');
  return path.join(cacheDir(), `${hash}.json`);
}

/** Return cached data if present and younger than ttlSeconds, else null. */
export function readCache<T>(url: string, ttlSeconds: number): T | null {
  if (ttlSeconds <= 0) return null;
  const file = keyToFile(url);
  if (!fs.existsSync(file)) return null;
  try {
    const entry = JSON.parse(fs.readFileSync(file, 'utf8')) as CacheEntry<T>;
    const ageSeconds = Math.floor(Date.now() / 1000) - entry.saved_at;
    if (ageSeconds > ttlSeconds) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export function writeCache<T>(url: string, data: T): void {
  ensureDir(cacheDir());
  const entry: CacheEntry<T> = {
    url,
    saved_at: Math.floor(Date.now() / 1000),
    data,
  };
  fs.writeFileSync(keyToFile(url), JSON.stringify(entry));
}

export interface CacheInfo {
  dir: string;
  entries: number;
  bytes: number;
}

export function cacheInfo(): CacheInfo {
  const dir = cacheDir();
  if (!fs.existsSync(dir)) return { dir, entries: 0, bytes: 0 };
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  let bytes = 0;
  for (const f of files) {
    try {
      bytes += fs.statSync(path.join(dir, f)).size;
    } catch {
      // ignore unreadable entries
    }
  }
  return { dir, entries: files.length, bytes };
}

/** Remove all cache entries. Returns the number of files deleted. */
export function clearCache(): number {
  const dir = cacheDir();
  if (!fs.existsSync(dir)) return 0;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    try {
      fs.rmSync(path.join(dir, f));
    } catch {
      // ignore
    }
  }
  return files.length;
}

/** Recommended TTLs (seconds) by resource volatility. */
export const TTL = {
  /** Immutable once finalized: activity detail, zones, laps, gear. */
  immutable: 7 * 24 * 60 * 60,
  /** Slow-changing: profile, athlete zones. */
  profile: 60 * 60,
  /** Volatile: activity lists, stats. */
  volatile: 5 * 60,
} as const;
