/**
 * Output and error handling — the heart of the CLI's deterministic contract.
 *
 *  - stdout carries data only (JSON by default, or a human table).
 *  - stderr carries diagnostics and a machine-readable error envelope.
 *  - Exit codes are stable and documented so an agent can branch on them.
 */

export enum ExitCode {
  Ok = 0,
  Generic = 1,
  Usage = 2,
  Auth = 3,
  RateLimited = 4,
  NotFound = 5,
}

/** Stable string codes included in the JSON error envelope. */
export type ErrorCode =
  | 'usage'
  | 'auth'
  | 'rate_limited'
  | 'not_found'
  | 'api_error'
  | 'network'
  | 'config'
  | 'internal';

const ERROR_EXIT: Record<ErrorCode, ExitCode> = {
  usage: ExitCode.Usage,
  auth: ExitCode.Auth,
  rate_limited: ExitCode.RateLimited,
  not_found: ExitCode.NotFound,
  api_error: ExitCode.Generic,
  network: ExitCode.Generic,
  config: ExitCode.Generic,
  internal: ExitCode.Generic,
};

/** A structured, exit-code-bearing error used throughout the CLI. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly hint?: string;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, opts: { hint?: string; details?: unknown } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.hint = opts.hint;
    this.details = opts.details;
  }

  get exitCode(): ExitCode {
    return ERROR_EXIT[this.code];
  }
}

export type OutputFormat = 'json' | 'table';

/**
 * Project a result down to an allow-list of top-level fields. Applied to each
 * element of an array, or to a single object; non-objects pass through. Fields
 * absent from a record are simply omitted. Used by the optional --fields flag.
 */
export function project(data: unknown, fields: string[]): unknown {
  if (fields.length === 0) return data;
  const pick = (obj: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      if (Object.prototype.hasOwnProperty.call(obj, f)) out[f] = obj[f];
    }
    return out;
  };
  const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v);

  if (Array.isArray(data)) {
    return data.map((el) => (isPlainObject(el) ? pick(el) : el));
  }
  if (isPlainObject(data)) return pick(data);
  return data;
}

/** Write a successful result to stdout in the requested format. */
export function emit(data: unknown, format: OutputFormat): void {
  if (format === 'table') {
    process.stdout.write(renderTable(data) + '\n');
  } else {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  }
}

/** Write the JSON error envelope to stderr and return the process exit code. */
export function reportError(err: unknown): ExitCode {
  const appErr =
    err instanceof AppError
      ? err
      : new AppError('internal', err instanceof Error ? err.message : String(err));

  const envelope = {
    error: {
      code: appErr.code,
      message: appErr.message,
      ...(appErr.hint ? { hint: appErr.hint } : {}),
      ...(appErr.details !== undefined ? { details: appErr.details } : {}),
    },
  };
  process.stderr.write(JSON.stringify(envelope, null, 2) + '\n');
  return appErr.exitCode;
}

/**
 * Minimal, dependency-free table renderer.
 *  - Array of objects -> column table from the union of keys.
 *  - Single object    -> two-column key/value table.
 *  - Primitive/array of primitives -> newline-joined values.
 */
function renderTable(data: unknown): string {
  if (Array.isArray(data)) {
    if (data.length === 0) return '(no rows)';
    if (data.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row))) {
      return renderObjectArray(data as Record<string, unknown>[]);
    }
    return data.map((v) => formatScalar(v)).join('\n');
  }
  if (data !== null && typeof data === 'object') {
    return renderKeyValue(data as Record<string, unknown>);
  }
  return formatScalar(data);
}

function renderObjectArray(rows: Record<string, unknown>[]): string {
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  const header = columns;
  const body = rows.map((row) => columns.map((c) => formatScalar(row[c])));
  return renderGrid([header, ...body], true);
}

function renderKeyValue(obj: Record<string, unknown>): string {
  const rows = Object.entries(obj).map(([k, v]) => [k, formatScalar(v)]);
  return renderGrid(rows, false);
}

function renderGrid(rows: string[][], hasHeader: boolean): string {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  const lines = rows.map((row) =>
    row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join('  ').trimEnd(),
  );
  if (hasHeader && lines.length > 0) {
    const sep = widths.map((w) => '-'.repeat(w)).join('  ');
    lines.splice(1, 0, sep);
  }
  return lines.join('\n');
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
