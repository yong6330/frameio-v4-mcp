#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(readFileSync(join(root, '.env'), 'utf8')
  .split(/\r?\n/)
  .filter(line => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
  .map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
const redirect = env.ADOBE_REDIRECT_URI;
if (!redirect) throw new Error('Set ADOBE_REDIRECT_URI in .env first');
const scheme = new URL(redirect).protocol.slice(0, -1);
const callbackPath = join(root, '.oauth-callback');
const appPath = join(homedir(), 'Applications', 'FrameIOOAuthHandler.app');
const plist = join(appPath, 'Contents', 'Info.plist');
const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

mkdirSync(dirname(appPath), { recursive: true });
rmSync(appPath, { recursive: true, force: true });
execFileSync('/usr/bin/osacompile', ['-o', appPath,
  '-e', 'on open location callbackURL',
  '-e', `do shell script "umask 077; /usr/bin/printf %s " & quoted form of callbackURL & " > " & quoted form of ${JSON.stringify(callbackPath)}`,
  '-e', 'end open location',
]);
for (const command of [
  'Add :CFBundleURLTypes array',
  `Add :CFBundleURLTypes:0:CFBundleURLName string ${scheme}`,
  'Add :CFBundleURLTypes:0:CFBundleURLSchemes array',
  `Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string ${scheme}`,
  'Add :LSBackgroundOnly bool true',
]) execFileSync('/usr/libexec/PlistBuddy', ['-c', command, plist]);
execFileSync(lsregister, ['-f', appPath]);
console.log(`Installed macOS OAuth handler for ${scheme}://`);
