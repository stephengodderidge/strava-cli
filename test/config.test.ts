import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  cacheDir,
  configDir,
  credentialsFilePath,
  loadDotEnv,
  oauthPort,
  readCredentials,
  resetDotEnvForTests,
  saveCredentials,
  tokenFilePath,
} from '../src/lib/config.js';

test('configDir/cacheDir/tokenFilePath honor overrides', () => {
  process.env.STRAVA_CONFIG_DIR = path.join('root', 'cfg');
  process.env.STRAVA_CACHE_DIR = path.join('root', 'cache');
  try {
    assert.equal(configDir(), path.join('root', 'cfg'));
    assert.equal(cacheDir(), path.join('root', 'cache'));
    assert.equal(tokenFilePath(), path.join('root', 'cfg', 'tokens.json'));
  } finally {
    delete process.env.STRAVA_CONFIG_DIR;
    delete process.env.STRAVA_CACHE_DIR;
  }
});

test('oauthPort default, override, and fallback on garbage', () => {
  delete process.env.STRAVA_OAUTH_PORT;
  assert.equal(oauthPort(), 41734);
  process.env.STRAVA_OAUTH_PORT = '5000';
  assert.equal(oauthPort(), 5000);
  process.env.STRAVA_OAUTH_PORT = 'nope';
  assert.equal(oauthPort(), 41734);
  delete process.env.STRAVA_OAUTH_PORT;
});

test('loadDotEnv loads vars, strips quotes, and never overwrites', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strava-env-'));
  fs.writeFileSync(
    path.join(dir, '.env'),
    '# a comment\nSTRAVA_TEST_A=fromfile\nSTRAVA_TEST_B="quoted"\nSTRAVA_TEST_C=should-not-win\n',
  );
  process.env.STRAVA_TEST_C = 'preset';
  try {
    resetDotEnvForTests();
    loadDotEnv(dir);
    assert.equal(process.env.STRAVA_TEST_A, 'fromfile');
    assert.equal(process.env.STRAVA_TEST_B, 'quoted');
    assert.equal(process.env.STRAVA_TEST_C, 'preset');
  } finally {
    delete process.env.STRAVA_TEST_A;
    delete process.env.STRAVA_TEST_B;
    delete process.env.STRAVA_TEST_C;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readCredentials reads from the environment', () => {
  process.env.STRAVA_CLIENT_ID = 'cid';
  process.env.STRAVA_CLIENT_SECRET = 'sec';
  process.env.STRAVA_REFRESH_TOKEN = 'rt';
  try {
    resetDotEnvForTests();
    const c = readCredentials();
    assert.equal(c.clientId, 'cid');
    assert.equal(c.clientSecret, 'sec');
    assert.equal(c.envRefreshToken, 'rt');
  } finally {
    delete process.env.STRAVA_CLIENT_ID;
    delete process.env.STRAVA_CLIENT_SECRET;
    delete process.env.STRAVA_REFRESH_TOKEN;
  }
});

test('saveCredentials persists to a file that readCredentials falls back to', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strava-creds-'));
  process.env.STRAVA_CONFIG_DIR = dir;
  delete process.env.STRAVA_CLIENT_ID;
  delete process.env.STRAVA_CLIENT_SECRET;
  try {
    resetDotEnvForTests();
    saveCredentials('file-cid', 'file-sec');
    assert.ok(fs.existsSync(credentialsFilePath()));
    const c = readCredentials();
    assert.equal(c.clientId, 'file-cid');
    assert.equal(c.clientSecret, 'file-sec');
  } finally {
    delete process.env.STRAVA_CONFIG_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('env credentials take precedence over the stored file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strava-creds-'));
  process.env.STRAVA_CONFIG_DIR = dir;
  try {
    saveCredentials('file-cid', 'file-sec');
    process.env.STRAVA_CLIENT_ID = 'env-cid';
    process.env.STRAVA_CLIENT_SECRET = 'env-sec';
    resetDotEnvForTests();
    const c = readCredentials();
    assert.equal(c.clientId, 'env-cid');
    assert.equal(c.clientSecret, 'env-sec');
  } finally {
    delete process.env.STRAVA_CONFIG_DIR;
    delete process.env.STRAVA_CLIENT_ID;
    delete process.env.STRAVA_CLIENT_SECRET;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
