import { createHash, randomBytes } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';

const AUTHORIZE_URL = 'https://ims-na1.adobelogin.com/ims/authorize/v2';
const TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';

export function createNativeOAuth({ env = process.env, fetchImpl = fetch }) {
  let pending;

  function start() {
    const clientId = required(env, 'ADOBE_CLIENT_ID');
    const redirectUri = required(env, 'ADOBE_REDIRECT_URI');
    const verifier = randomBytes(64).toString('base64url');
    const state = randomBytes(24).toString('base64url');
    pending = { state, verifier };
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: env.ADOBE_SCOPES || 'openid',
      response_type: 'code',
      state,
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    });
    return { authorizationUrl: url.toString(), redirectUri };
  }

  async function complete(callbackUrl) {
    if (!pending) throw new Error('Run start_oauth first in the same MCP session');
    const callback = new URL(callbackUrl);
    if (callback.searchParams.get('error')) throw new Error(`Adobe OAuth failed: ${callback.searchParams.get('error')}`);
    const code = callback.searchParams.get('code');
    const state = callback.searchParams.get('state');
    if (!code || state !== pending.state) throw new Error('Invalid OAuth callback code or state');
    const { verifier } = pending;
    pending = undefined;
    const tokenUrl = new URL(TOKEN_URL);
    tokenUrl.searchParams.set('client_id', required(env, 'ADOBE_CLIENT_ID'));
    const body = new URLSearchParams({ code, grant_type: 'authorization_code', code_verifier: verifier });
    const response = await fetchImpl(tokenUrl.toString(), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    const payload = await response.json();
    if (!response.ok || !payload.access_token) throw new Error(`Adobe token exchange failed (${response.status})`);
    return { accessToken: payload.access_token, refreshToken: payload.refresh_token, tokenType: payload.token_type, expiresIn: payload.expires_in };
  }

  return { start, complete };
}

export async function saveTokens(envPath, { accessToken, refreshToken }) {
  let contents = await readFile(envPath, 'utf8').catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error));
  contents = setEnv(contents, 'FRAMEIO_ACCESS_TOKEN', accessToken);
  if (refreshToken) contents = setEnv(contents, 'ADOBE_REFRESH_TOKEN', refreshToken);
  const temporary = `${envPath}.tmp`;
  await writeFile(temporary, contents, { mode: 0o600 });
  await rename(temporary, envPath);
}

function setEnv(contents, name, value) {
  if (/\r|\n/.test(value)) throw new Error(`Invalid ${name}`);
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  return pattern.test(contents) ? contents.replace(pattern, line) : `${contents}${contents && !contents.endsWith('\n') ? '\n' : ''}${line}\n`;
}

function required(env, name) {
  if (!env[name]) throw new Error(`Set ${name} in .env`);
  return env[name];
}
