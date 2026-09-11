import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNativeOAuth, saveTokens } from '../src/oauth.js';

test('completes Native App PKCE login and returns the access token only to the caller', async () => {
  let tokenRequest;
  const oauth = createNativeOAuth({
    env: { ADOBE_CLIENT_ID: 'client-id', ADOBE_REDIRECT_URI: 'frameio-mcp://oauth/callback' },
    fetchImpl: async (url, options) => {
      tokenRequest = { url, options };
      return new Response(JSON.stringify({ access_token: 'secret-token', token_type: 'bearer', expires_in: 86399 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const started = await oauth.start();
  const authorize = new URL(started.authorizationUrl);
  assert.equal(authorize.searchParams.get('client_id'), 'client-id');
  assert.equal(authorize.searchParams.get('redirect_uri'), 'frameio-mcp://oauth/callback');
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');

  const completed = await oauth.complete(`frameio-mcp://oauth/callback?code=auth-code&state=${authorize.searchParams.get('state')}`);
  assert.equal(completed.accessToken, 'secret-token');
  assert.equal(tokenRequest.url, 'https://ims-na1.adobelogin.com/ims/token/v3?client_id=client-id');
  assert.equal(tokenRequest.options.body.get('code'), 'auth-code');
  assert.ok(tokenRequest.options.body.get('code_verifier'));
});

test('completes PKCE from the macOS URL-handler file after an MCP restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frameio-handler-'));
  const sessionPath = join(directory, 'pending.json');
  const callbackPath = join(directory, 'callback');
  const env = { ADOBE_CLIENT_ID: 'client-id', ADOBE_REDIRECT_URI: 'frameio-mcp://oauth/callback' };
  try {
    const started = await createNativeOAuth({ env, sessionPath, callbackPath }).start();
    const state = new URL(started.authorizationUrl).searchParams.get('state');
    await writeFile(callbackPath, `frameio-mcp://oauth/callback?code=auth-code&state=${state}`);
    const oauth = createNativeOAuth({
      env,
      sessionPath,
      callbackPath,
      fetchImpl: async () => new Response(JSON.stringify({ access_token: 'saved-token' }), { status: 200 }),
    });
    assert.equal((await oauth.complete()).accessToken, 'saved-token');
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('saves OAuth tokens without replacing existing environment values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frameio-oauth-'));
  const path = join(directory, '.env');
  try {
    await writeFile(path, 'ADOBE_CLIENT_ID=client-id\nFRAMEIO_ACCESS_TOKEN=\n');
    await saveTokens(path, { accessToken: 'access-value' });
    assert.equal(await readFile(path, 'utf8'), 'ADOBE_CLIENT_ID=client-id\nFRAMEIO_ACCESS_TOKEN=access-value\n');
  } finally {
    await rm(directory, { recursive: true });
  }
});
