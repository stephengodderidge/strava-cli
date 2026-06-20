/**
 * Small helpers shared across command modules: constructing a client that
 * respects the cache toggle, and emitting output with optional verbose
 * rate-limit reporting on stderr.
 */

import { StravaClient } from '../lib/client.js';
import { emit } from '../lib/output.js';
import type { GlobalContext } from '../lib/args.js';

export function makeClient(ctx: GlobalContext): StravaClient {
  return new StravaClient({ useCache: ctx.useCache });
}

export function output(data: unknown, ctx: GlobalContext, client?: StravaClient): void {
  emit(data, ctx.format);
  if (ctx.verbose && client?.lastRateLimit) {
    process.stderr.write(`rate-limit: ${JSON.stringify(client.lastRateLimit)}\n`);
  }
}
