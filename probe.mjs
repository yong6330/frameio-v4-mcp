#!/usr/bin/env node
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const [name, json = '{}'] = process.argv.slice(2);
const client = new Client({ name: 'frameio-probe', version: '1.0.0' });
const entry = fileURLToPath(new URL('./src/index.js', import.meta.url));
const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: process.env, stderr: 'ignore' });
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  if (!name) console.log(JSON.stringify(tools.map(({ name: toolName, inputSchema }) => ({ name: toolName, inputSchema })), null, 2));
  else {
    assert(tools.some(tool => tool.name === name), 'Tool must be advertised by the live server');
    const result = await client.callTool({ name, arguments: JSON.parse(json) }, undefined, { timeout: 30000 });
    console.log(JSON.stringify(result, null, 2));
    if (result.isError) process.exitCode = 1;
  }
} finally {
  await client.close();
}
