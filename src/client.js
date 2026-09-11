import { getOperation } from './catalog.js';

const API_ORIGIN = 'https://api.frame.io';
const TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';

export function createClient({ catalog, env = process.env, fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  let accessToken = env.FRAMEIO_ACCESS_TOKEN;

  async function refreshAccessToken() {
    const { ADOBE_CLIENT_ID: clientId, ADOBE_CLIENT_SECRET: clientSecret, ADOBE_REFRESH_TOKEN: refreshToken } = env;
    if (!clientId || !clientSecret || !refreshToken) throw new Error('Set FRAMEIO_ACCESS_TOKEN or Adobe refresh credentials in .env');
    const form = new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken });
    if (env.ADOBE_SCOPES) form.set('scope', env.ADOBE_SCOPES);
    const response = await fetchImpl(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form });
    const payload = await parseResponse(response);
    if (!response.ok || !payload?.access_token) throw new Error(`Adobe IMS token refresh failed (${response.status})`);
    accessToken = payload.access_token;
    return accessToken;
  }

  async function token() {
    return accessToken || refreshAccessToken();
  }

  async function invoke({ operationId, path: pathParameters = {}, query = {}, body, confirm = false }) {
    const operation = getOperation(catalog, operationId);
    if (operation.method === 'DELETE' && confirm !== true) throw new Error('DELETE operations require confirm: true');
    let pathname = operation.path.replace(/\{([^}]+)\}/g, (_, name) => {
      if (pathParameters[name] === undefined) throw new Error(`Missing path parameter: ${name}`);
      return encodeURIComponent(String(pathParameters[name]));
    });
    const url = new URL(pathname, API_ORIGIN);
    for (const [name, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(name, String(item));
    }

    let refreshed = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const bearer = await token();
      const headers = { authorization: `Bearer ${bearer}`, accept: 'application/json' };
      if (body !== undefined) headers['content-type'] = 'application/json';
      const response = await fetchImpl(url.toString(), { method: operation.method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      if (response.status === 401 && !refreshed && env.ADOBE_REFRESH_TOKEN) {
        await refreshAccessToken();
        refreshed = true;
        attempt--;
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000 * (2 ** attempt));
        continue;
      }
      const data = await parseResponse(response);
      if (!response.ok) {
        const detail = redact(typeof data === 'string' ? data : JSON.stringify(data), [bearer, env.FRAMEIO_ACCESS_TOKEN, env.ADOBE_CLIENT_SECRET, env.ADOBE_REFRESH_TOKEN]);
        throw new Error(`Frame.io ${response.status}: ${detail}`);
      }
      return {
        status: response.status,
        data,
        rateLimit: {
          limit: response.headers.get('x-ratelimit-limit'),
          remaining: response.headers.get('x-ratelimit-remaining'),
          windowMs: response.headers.get('x-ratelimit-window'),
        },
      };
    }
    throw new Error('Frame.io request exhausted retries');
  }

  return { invoke, verifyConnection: () => invoke({ operationId: 'users.show' }) };
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function redact(text, secrets) {
  return secrets.filter(Boolean).reduce((value, secret) => value.split(secret).join('[REDACTED]'), text);
}
