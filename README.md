# Frame.io V4 MCP

Node.js stdio MCP server backed by Frame.io's official V4 OpenAPI document. It exposes all 97 operations through a searchable catalog and adds complete local multipart upload handling.

## MCP tools

- `verify_connection` — verifies OAuth with `GET /v4/me`
- `search_tools` — searches by text, API tag, or HTTP method
- `get_tool_schema` — returns official parameters and referenced schemas for an `operationId`
- `invoke_tool` — invokes any published operation; DELETE requires `confirm: true`
- `upload_local_file` — creates an upload, PUTs each prescribed chunk, and reads upload status

The catalog covers accounts, workspaces, projects, folders, files, version stacks, comments, shares, reviewers, permissions, metadata, search, collections, groups, custom actions, webhooks, users, and audit logs.

## Install and run

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env
npm start
```

Keep `.env` private. The server never writes or prints credentials.

## Adobe Developer Console and OAuth

1. Sign in to [Adobe Developer Console](https://developer.adobe.com/console) with the Adobe ID used for Frame.io V4.
2. Create a Developer Console project. This is an API application, not a Frame.io content project.
3. Choose **Add API**, select **Frame.io API**, and select **OAuth Native App** for user authentication.
4. Use the Native App's authorization-code flow with PKCE. Do not create or store a client secret.
5. Request `openid`, `profile`, `offline_access`, and `additional_info.roles`. Adobe documents that refresh-token availability depends on the credential and API; the MCP also works with only a short-lived access token.
6. Complete the Adobe login yourself, then place the returned values in `.env`. `FRAMEIO_ACCESS_TOKEN` is sufficient for a session. If Adobe issues a refresh token, `ADOBE_CLIENT_ID` and `ADOBE_REFRESH_TOKEN` enable public-client refresh without a client secret.
7. Verify only after login:

```bash
node probe.mjs verify_connection '{}'
```

Official references: [Getting Started](https://developer.adobe.com/frameio/guides/), [Authentication](https://developer.adobe.com/frameio/guides/Authentication/), [Upload](https://developer.adobe.com/frameio/guides/How%20To:%20Upload/), and [OpenAPI](https://api.frame.io/v4/openapi.json).

## Examples

Discover the exact API operation before calling it:

```bash
node probe.mjs search_tools '{"query":"comments"}'
node probe.mjs get_tool_schema '{"operation_id":"comments.index"}'
```

Timecoded client comments use the documented query parameter:

```json
{
  "operation_id": "comments.index",
  "path": { "account_id": "ACCOUNT_ID", "file_id": "FILE_ID" },
  "query": { "timestamp_as_timecode": true, "include": "owner,replies" }
}
```

Creating a review link uses `shares.create`; its response contains `short_url`. New cuts can be uploaded and combined with an earlier file using `version_stacks.create`. Approval must come from explicit API evidence such as the production's configured metadata or review decision; zero unresolved comments alone is not treated as approval.

## Tests

```bash
npm test
```

The checked-in OpenAPI document was retrieved on 2026-09-11 and has SHA-256 `e7487c89bfebadca4d67ee9e7a6c38c56318d3d83a41d52f266cb05d6681c825`.
