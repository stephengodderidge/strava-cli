/**
 * Centralized argument parsing built on node:util parseArgs.
 *
 * Global flags (available on every command) are merged with each command's own
 * options so behavior is consistent and defined in exactly one place.
 */

import { parseArgs } from 'node:util';

import { AppError, type OutputFormat } from './output.js';

export interface GlobalContext {
  format: OutputFormat;
  useCache: boolean;
  verbose: boolean;
}

export interface OptionSpec {
  type: 'string' | 'boolean';
  short?: string;
  multiple?: boolean;
}

export type OptionMap = Record<string, OptionSpec>;

const GLOBAL_OPTIONS: OptionMap = {
  format: { type: 'string' },
  'no-cache': { type: 'boolean' },
  verbose: { type: 'boolean', short: 'v' },
  help: { type: 'boolean', short: 'h' },
};

export interface ParsedCommand {
  values: Record<string, string | boolean | string[] | boolean[] | undefined>;
  positionals: string[];
  global: GlobalContext;
  helpRequested: boolean;
}

/** Parse a command's args, merging in the shared global flags. */
export function parseCommand(args: string[], options: OptionMap = {}): ParsedCommand {
  const merged = { ...GLOBAL_OPTIONS, ...options };
  let parsed;
  try {
    parsed = parseArgs({ args, options: merged, allowPositionals: true, strict: true });
  } catch (err) {
    throw new AppError('usage', (err as Error).message, {
      hint: 'Run the command with --help to see valid options.',
    });
  }

  return {
    values: parsed.values as ParsedCommand['values'],
    positionals: parsed.positionals,
    global: {
      format: normalizeFormat(parsed.values.format),
      useCache: !parsed.values['no-cache'],
      verbose: Boolean(parsed.values.verbose),
    },
    helpRequested: Boolean(parsed.values.help),
  };
}

function normalizeFormat(value: unknown): OutputFormat {
  if (value === undefined) return 'json';
  if (value === 'json' || value === 'table') return value;
  throw new AppError('usage', `Invalid --format "${String(value)}". Use "json" or "table".`);
}

/** Read a required string option, throwing a usage error if absent. */
export function requireString(
  values: ParsedCommand['values'],
  key: string,
): string {
  const v = values[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new AppError('usage', `Missing required option --${key}.`);
  }
  return v;
}

/** Read an optional integer option, validating when present. */
export function optionalInt(
  values: ParsedCommand['values'],
  key: string,
): number | undefined {
  const v = values[key];
  if (v === undefined) return undefined;
  const n = Number.parseInt(String(v), 10);
  if (!Number.isInteger(n)) {
    throw new AppError('usage', `Option --${key} must be an integer.`);
  }
  return n;
}

/**
 * Convert a user-supplied date to unix seconds. Accepts a unix timestamp,
 * `YYYY-MM-DD`, or any value parseable by Date (ISO-8601 recommended).
 */
export function toUnixSeconds(value: string, optionName: string): number {
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new AppError('usage', `Option --${optionName} is not a valid date: "${value}".`, {
      hint: 'Use a unix timestamp, YYYY-MM-DD, or an ISO-8601 date.',
    });
  }
  return Math.floor(ms / 1000);
}
