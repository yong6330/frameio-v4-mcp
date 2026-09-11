# Frame.io V4 MCP design

Date: 2026-09-11

## Goal

Provide a Node.js stdio MCP server for every operation in the current Frame.io V4 OpenAPI document, plus the multi-request local-file upload flow.

## Source of truth

- OpenAPI: `https://api.frame.io/v4/openapi.json`
- Retrieved: 2026-09-11
- SHA-256: `e7487c89bfebadca4d67ee9e7a6c38c56318d3d83a41d52f266cb05d6681c825`
- Inventory: 97 operations across 19 tags

The server must not invent paths or request fields. `openapi.json` is the runtime catalog and schema source.

## MCP interface

- `start_oauth`: create an Adobe Native App PKCE authorization URL.
- `complete_oauth`: validate the returned state, exchange the authorization code, and save the access token to `.env`.
- `verify_connection`: call `GET /v4/me` and report authenticated user details.
- `search_tools`: search the 97-operation catalog by text, tag, or HTTP method.
- `get_tool_schema`: return the documented path/query/request-body schema for one `operationId`.
- `invoke_tool`: execute one catalogued operation using separate path parameters, query parameters, and JSON body.
- `upload_local_file`: create a local upload, PUT each exact byte range to the returned presigned URLs with `x-amz-acl: private`, then read upload status.

DELETE operations are supported. `invoke_tool` requires `confirm: true` for DELETE requests so an accidental model call cannot delete data.

## Authentication

The user creates the Adobe Developer Console project, adds Frame.io V4 API access as an OAuth Native App, and personally completes the browser consent opened from `start_oauth`. `complete_oauth` exchanges the callback code and saves the token to `.env`, which is ignored by Git.

The server accepts `FRAMEIO_ACCESS_TOKEN`. If Adobe issues a refresh token, `ADOBE_CLIENT_ID` and `ADOBE_REFRESH_TOKEN` allow public-client refresh through Adobe IMS `/ims/token/v3`; no client secret is stored. The server never prints tokens.

## HTTP behavior

- Base URL is fixed to `https://api.frame.io`.
- Only paths and methods present in the vendored OpenAPI document may be called.
- Opaque pagination links are returned unchanged; callers can supply the documented `after` cursor.
- Retry `429` and transient `5xx` responses with bounded exponential backoff.
- Return Frame.io response bodies and status codes without fabricating success.
- Validate local upload paths and file sizes before creating the remote file.

## Review workflow coverage

The catalog supports upload, version stacks, shares, reviewers, timecoded comments, resolved comments, share activity, metadata, and all other published V4 operations. Approval is reported only from explicit API evidence such as configured metadata or resolved comments; absence of open comments alone is not called approval.

## Verification

- Offline self-check against the vendored OpenAPI catalog: 97 unique operations and no unrecognized method/path invocation.
- Mocked HTTP check for request construction, DELETE confirmation, bounded retry, and chunk boundaries.
- Live verification stops at `verify_connection` until the user completes Developer Console registration and OAuth login.
