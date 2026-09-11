#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getOperationSchema, loadCatalog, searchOperations } from './catalog.js';
import { createClient } from './client.js';
import { uploadLocalFile } from './upload.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) loadEnvFile(envPath);
const catalog = loadCatalog(fileURLToPath(new URL('../openapi.json', import.meta.url)));
const api = createClient({ catalog });
const server = new McpServer({ name: 'frameio-v4-mcp', version: '1.0.0' });
const object = z.record(z.unknown());
const output = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const run = handler => async args => {
  try { return output(await handler(args)); }
  catch (error) { return { ...output({ error: error.message }), isError: true }; }
};

server.tool('verify_connection', 'Verify Frame.io V4 OAuth by calling GET /v4/me.', {}, run(() => api.verifyConnection()));

server.tool('search_tools', 'Search all operations in the official Frame.io V4 OpenAPI catalog.', {
  query: z.string().optional(),
  tag: z.string().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  limit: z.number().int().min(1).max(100).default(100),
}, run(({ query, tag, method, limit }) => {
  const matches = searchOperations(catalog, { query, tag, method });
  return {
    total: matches.length,
    operations: matches.slice(0, limit).map(({ operationId, method: verb, path, summary, tags }) => ({ operationId, method: verb, path, summary, tags })),
  };
}));

server.tool('get_tool_schema', 'Get official parameters and referenced schemas for one Frame.io V4 operation.', {
  operation_id: z.string(),
}, run(({ operation_id }) => getOperationSchema(catalog, operation_id)));

server.tool('invoke_tool', 'Invoke one operation from the official Frame.io V4 OpenAPI catalog. DELETE requires confirm=true.', {
  operation_id: z.string(),
  path: object.optional(),
  query: object.optional(),
  body: z.unknown().optional(),
  confirm: z.boolean().default(false),
}, run(({ operation_id, path, query, body, confirm }) => api.invoke({ operationId: operation_id, path, query, body, confirm })));

server.tool('upload_local_file', 'Upload a local file through Frame.io V4 presigned URLs and return its upload status.', {
  file_path: z.string(),
  account_id: z.string(),
  folder_id: z.string(),
  name: z.string().optional(),
}, run(({ file_path, account_id, folder_id, name }) => uploadLocalFile({ client: api, filePath: file_path, accountId: account_id, folderId: folder_id, name })));

await server.connect(new StdioServerTransport());
