import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { Client } from '../../after-effects-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../../after-effects-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

test('advertises five tools and searches all 97 operations over stdio', async () => {
  const entry = fileURLToPath(new URL('../src/index.js', import.meta.url));
  const client = new Client({ name: 'frameio-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], stderr: 'pipe' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(tool => tool.name).sort(), ['get_tool_schema', 'invoke_tool', 'search_tools', 'upload_local_file', 'verify_connection']);
    const result = await client.callTool({ name: 'search_tools', arguments: {} });
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.total, 97);
  } finally {
    await client.close();
  }
});

test('documents startup, OAuth environment, and probe host', async () => {
  const [readme, example, ignore, probe] = await Promise.all([
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../.env.example', import.meta.url), 'utf8'),
    readFile(new URL('../.gitignore', import.meta.url), 'utf8'),
    readFile(new URL('../probe.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(readme, /npm start/);
  assert.match(example, /FRAMEIO_ACCESS_TOKEN=/);
  assert.match(example, /ADOBE_REFRESH_TOKEN=/);
  assert.match(ignore, /^\.env$/m);
  assert.match(probe, /frameio/);
});
