import test from 'node:test';
import assert from 'node:assert/strict';

import { AppError, ExitCode, emit, reportError } from '../src/lib/output.js';
import { capture } from './helpers.js';

test('AppError maps codes to exit codes', () => {
  assert.equal(new AppError('usage', 'x').exitCode, ExitCode.Usage);
  assert.equal(new AppError('auth', 'x').exitCode, ExitCode.Auth);
  assert.equal(new AppError('rate_limited', 'x').exitCode, ExitCode.RateLimited);
  assert.equal(new AppError('not_found', 'x').exitCode, ExitCode.NotFound);
  assert.equal(new AppError('api_error', 'x').exitCode, ExitCode.Generic);
  assert.equal(new AppError('internal', 'x').exitCode, ExitCode.Generic);
});

test('reportError writes JSON envelope to stderr and returns exit code', async () => {
  const { stderr, result } = await capture(() =>
    reportError(new AppError('auth', 'nope', { hint: 'do x' })),
  );
  assert.equal(result, ExitCode.Auth);
  const parsed = JSON.parse(stderr);
  assert.equal(parsed.error.code, 'auth');
  assert.equal(parsed.error.message, 'nope');
  assert.equal(parsed.error.hint, 'do x');
});

test('reportError wraps unknown errors as internal/generic', async () => {
  const { stderr, result } = await capture(() => reportError(new Error('boom')));
  assert.equal(result, ExitCode.Generic);
  assert.equal(JSON.parse(stderr).error.code, 'internal');
});

test('emit json round-trips', async () => {
  const data = { a: 1, b: [1, 2, 3] };
  const { stdout } = await capture(() => emit(data, 'json'));
  assert.deepEqual(JSON.parse(stdout), data);
});

test('emit table renders an object array with header + separator', async () => {
  const rows = [
    { id: 1, name: 'a' },
    { id: 2, name: 'bb' },
  ];
  const { stdout } = await capture(() => emit(rows, 'table'));
  const lines = stdout.trimEnd().split('\n');
  assert.equal(lines.length, 4); // header, separator, 2 rows
  assert.match(lines[0] ?? '', /id\s+name/);
  assert.match(lines[1] ?? '', /-+\s+-+/);
});

test('emit table renders a single object as key/value', async () => {
  const { stdout } = await capture(() => emit({ k: 'v', n: 3 }, 'table'));
  assert.match(stdout, /k\s+v/);
  assert.match(stdout, /n\s+3/);
});

test('emit table renders an empty array', async () => {
  const { stdout } = await capture(() => emit([], 'table'));
  assert.equal(stdout.trim(), '(no rows)');
});
