import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../src/catalog.js';
import { createClient } from '../src/client.js';

const catalog = loadCatalog(fileURLToPath(new URL('../openapi.json', import.meta.url)));
const jsonResponse = (status, value, headers = {}) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json', ...headers },
});

test('substitutes path parameters and encodes query values', async () => {
  let request;
  const client = createClient({ catalog, env: { FRAMEIO_ACCESS_TOKEN: 'secret' }, fetchImpl: async (...args) => {
    request = args;
    return jsonResponse(200, { data: [] });
  }});
  await client.invoke({ operationId: 'comments.index', path: { account_id: 'acct', file_id: 'file/id' }, query: { timestamp_as_timecode: true, include: 'owner,replies' } });
  assert.equal(request[0], 'https://api.frame.io/v4/accounts/acct/files/file%2Fid/comments?timestamp_as_timecode=true&include=owner%2Creplies');
  assert.equal(request[1].headers.authorization, 'Bearer secret');
});

test('requires explicit confirmation for DELETE', async () => {
  const client = createClient({ catalog, env: { FRAMEIO_ACCESS_TOKEN: 'secret' }, fetchImpl: async () => jsonResponse(204, {}) });
  await assert.rejects(client.invoke({ operationId: 'comments.delete', path: { account_id: 'acct', comment_id: 'comment' } }), /confirm: true/);
});

test('does not expose bearer tokens in API errors', async () => {
  const client = createClient({ catalog, env: { FRAMEIO_ACCESS_TOKEN: 'top-secret' }, fetchImpl: async () => new Response('top-secret rejected', { status: 401 }) });
  await assert.rejects(client.invoke({ operationId: 'users.show' }), error => !error.message.includes('top-secret') && error.message.includes('[REDACTED]'));
});

test('retries a rate-limited request once', async () => {
  let calls = 0;
  const client = createClient({
    catalog,
    env: { FRAMEIO_ACCESS_TOKEN: 'secret' },
    sleep: async () => {},
    fetchImpl: async () => ++calls === 1 ? jsonResponse(429, { errors: [{ detail: 'slow down' }] }) : jsonResponse(200, { data: { id: 'user' } }),
  });
  const result = await client.invoke({ operationId: 'users.show' });
  assert.equal(calls, 2);
  assert.equal(result.data.data.id, 'user');
});

test('verifies the authenticated user through /v4/me', async () => {
  let url;
  const client = createClient({ catalog, env: { FRAMEIO_ACCESS_TOKEN: 'secret' }, fetchImpl: async value => {
    url = value;
    return jsonResponse(200, { data: { id: 'user', name: 'Reviewer' } });
  }});
  const result = await client.verifyConnection();
  assert.equal(url, 'https://api.frame.io/v4/me');
  assert.equal(result.data.data.name, 'Reviewer');
});

test('refreshes a Native App token as a public client without a client secret', async () => {
  const requests = [];
  const client = createClient({
    catalog,
    env: { ADOBE_CLIENT_ID: 'native-client', ADOBE_REFRESH_TOKEN: 'refresh-value' },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.startsWith('https://ims-na1.adobelogin.com/ims/token/v3')) return jsonResponse(200, { access_token: 'native-access' });
      return jsonResponse(200, { data: { id: 'user' } });
    },
  });
  await client.verifyConnection();
  assert.equal(requests[0].url, 'https://ims-na1.adobelogin.com/ims/token/v3?client_id=native-client');
  assert.equal(requests[0].options.headers.authorization, undefined);
  assert.equal(requests[0].options.body.get('client_secret'), null);
  assert.equal(requests[1].options.headers.authorization, 'Bearer native-access');
});
