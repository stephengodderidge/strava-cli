import test from 'node:test';
import assert from 'node:assert/strict';

import {
  optionalInt,
  parseCommand,
  requireString,
  toUnixSeconds,
  type ParsedCommand,
} from '../src/lib/args.js';
import { AppError } from '../src/lib/output.js';

const isUsage = (e: unknown): e is AppError => e instanceof AppError && e.code === 'usage';

test('parseCommand applies defaults', () => {
  const p = parseCommand([]);
  assert.equal(p.global.format, 'json');
  assert.equal(p.global.useCache, true);
  assert.equal(p.global.verbose, false);
  assert.equal(p.helpRequested, false);
});

test('parseCommand reads global flags', () => {
  const p = parseCommand(['--format', 'table', '--no-cache', '-v', '--help']);
  assert.equal(p.global.format, 'table');
  assert.equal(p.global.useCache, false);
  assert.equal(p.global.verbose, true);
  assert.equal(p.helpRequested, true);
});

test('parseCommand rejects an invalid --format', () => {
  assert.throws(() => parseCommand(['--format', 'xml']), isUsage);
});

test('parseCommand rejects unknown options', () => {
  assert.throws(() => parseCommand(['--bogus']), isUsage);
});

test('parseCommand returns command options and positionals', () => {
  const p = parseCommand(['123', '--laps'], { laps: { type: 'boolean' } });
  assert.deepEqual(p.positionals, ['123']);
  assert.equal(p.values.laps, true);
});

test('optionalInt parses, defaults, and validates', () => {
  const v = (o: Record<string, string>) => o as unknown as ParsedCommand['values'];
  assert.equal(optionalInt(v({ limit: '5' }), 'limit'), 5);
  assert.equal(optionalInt(v({}), 'limit'), undefined);
  assert.throws(() => optionalInt(v({ limit: 'abc' }), 'limit'), isUsage);
});

test('requireString returns or throws', () => {
  const v = (o: Record<string, string>) => o as unknown as ParsedCommand['values'];
  assert.equal(requireString(v({ x: 'val' }), 'x'), 'val');
  assert.throws(() => requireString(v({}), 'x'), isUsage);
});

test('toUnixSeconds handles unix, date, and ISO; rejects garbage', () => {
  assert.equal(toUnixSeconds('1700000000', 'after'), 1700000000);
  assert.equal(toUnixSeconds('2023-01-01', 'after'), Math.floor(Date.parse('2023-01-01') / 1000));
  assert.equal(
    toUnixSeconds('2023-01-01T00:00:00Z', 'after'),
    Math.floor(Date.parse('2023-01-01T00:00:00Z') / 1000),
  );
  assert.throws(() => toUnixSeconds('not-a-date', 'after'), isUsage);
});
