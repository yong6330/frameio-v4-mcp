# Frame.io V4 MCP Implementation Plan

Status: completed 2026-09-11. Offline suite: 12 tests passing. Live OAuth verification remains user-gated.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js stdio MCP server that exposes every operation in the current Frame.io V4 OpenAPI catalog and performs local multipart uploads.

**Architecture:** A vendored OpenAPI document is indexed by `operationId`. Five MCP tools search and inspect the catalog, invoke catalogued REST operations, verify authentication, and upload local files through Frame.io-provided presigned URLs.

**Tech Stack:** Node.js ESM, built-in `fetch`, `fs`, `node:test`, `@modelcontextprotocol/sdk`, `zod`.

**Spec:** `tools/frameio-mcp/DESIGN.md`

## Global Constraints

- Runtime paths and request fields come only from `https://api.frame.io/v4/openapi.json`, retrieved 2026-09-11 with SHA-256 `e7487c89bfebadca4d67ee9e7a6c38c56318d3d83a41d52f266cb05d6681c825`.
- All 97 published operations, including DELETE operations, are callable.
- DELETE requires `confirm: true`.
- Credentials exist only in `.env` and are never printed.
- Live verification stops until the user performs Adobe Developer Console registration and OAuth login.
- No new HTTP client dependency; use Node's built-in `fetch`.

---

### Task 1: OpenAPI catalog

**Files:**
- Create: `tools/frameio-mcp/openapi.json`
- Create: `tools/frameio-mcp/package.json`
- Create: `tools/frameio-mcp/src/catalog.js`
- Create: `tools/frameio-mcp/test/catalog.test.js`

**Interfaces:**
- Produces: `loadCatalog(path)`, `searchOperations(catalog, filters)`, and `getOperation(catalog, operationId)`.

- [ ] Write a failing `node:test` asserting 97 unique operations, filtering by `Files` and `DELETE`, and rejection of an unknown operation ID.
- [ ] Run `node --test test/catalog.test.js` and confirm failure because `src/catalog.js` is absent.
- [ ] Add the minimal package manifest, copy the verified OpenAPI document, and implement catalog indexing from `paths`.
- [ ] Run `node --test test/catalog.test.js` and confirm it passes.

### Task 2: Safe HTTP execution and authentication

**Files:**
- Create: `tools/frameio-mcp/src/client.js`
- Create: `tools/frameio-mcp/test/client.test.js`

**Interfaces:**
- Consumes: `getOperation(catalog, operationId)`.
- Produces: `createClient({ catalog, env, fetchImpl, sleep })` with `invoke({ operationId, path, query, body, confirm })` and `verifyConnection()`.

- [ ] Write failing tests proving path substitution and query encoding, DELETE rejection without `confirm: true`, bearer-token redaction from errors, one retry after `429`, and `/v4/me` verification.
- [ ] Run `node --test test/client.test.js` and confirm failure because `src/client.js` is absent.
- [ ] Implement fixed-origin request construction, catalog method/path enforcement, JSON handling, bounded exponential retry for `429` and `5xx`, and optional refresh-token exchange at Adobe IMS.
- [ ] Run `node --test test/client.test.js` and confirm it passes.

### Task 3: Local multipart upload

**Files:**
- Create: `tools/frameio-mcp/src/upload.js`
- Create: `tools/frameio-mcp/test/upload.test.js`

**Interfaces:**
- Produces: `uploadLocalFile({ client, filePath, accountId, folderId, name, fetchImpl })`.

- [ ] Write a failing test using a temporary 10-byte file and two declared 5-byte upload URLs; assert the exact byte chunks and `x-amz-acl: private` header.
- [ ] Run `node --test test/upload.test.js` and confirm failure because `src/upload.js` is absent.
- [ ] Implement file validation, `files.create_local_upload`, sequential byte-range reads, presigned PUTs, and `files.show_file_upload_status`.
- [ ] Run `node --test test/upload.test.js` and confirm it passes.

### Task 4: stdio MCP server

**Files:**
- Create: `tools/frameio-mcp/src/index.js`
- Create: `tools/frameio-mcp/test/server.test.js`

**Interfaces:**
- Consumes: catalog, client, and upload functions.
- Produces MCP tools: `verify_connection`, `search_tools`, `get_tool_schema`, `invoke_tool`, `upload_local_file`.

- [ ] Write a failing stdio client test asserting all five tools are advertised and `search_tools` reports 97 operations.
- [ ] Run `node --test test/server.test.js` and confirm failure because `src/index.js` is absent.
- [ ] Register the five tools with Zod schemas and connect `StdioServerTransport`.
- [ ] Run `node --test test/server.test.js` and confirm it passes.

### Task 5: Configuration, documentation, and probe integration

**Files:**
- Create: `tools/frameio-mcp/.env.example`
- Create: `tools/frameio-mcp/.gitignore`
- Create: `tools/frameio-mcp/README.md`
- Modify: `tools/probe.mjs`

**Interfaces:**
- `node tools/probe.mjs frameio search_tools '{"query":"comments"}'` starts the new server exactly like the existing Adobe MCP probes.

- [ ] Extend the server test to assert the documented start command and sample environment names exist.
- [ ] Run the test and confirm the documentation/configuration assertions fail.
- [ ] Document Developer Console setup, OAuth Web App redirect requirements, environment variables, live verification boundary, and destructive-operation confirmation; add the Frame.io host to `probe.mjs`.
- [ ] Run `npm test` from `tools/frameio-mcp` and `node ../probe.mjs frameio search_tools '{"query":"comments"}'`.
- [ ] Re-read `DESIGN.md`, confirm every requirement has a corresponding test or documented live gate, and report the unauthenticated live-test boundary.
