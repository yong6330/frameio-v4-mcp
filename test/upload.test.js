import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uploadLocalFile } from '../src/upload.js';

test('uploads exact chunks to Frame.io presigned URLs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frameio-upload-'));
  const filePath = join(directory, 'review.mp4');
  await writeFile(filePath, Buffer.from('0123456789'));
  const calls = [];
  const client = { invoke: async args => {
    calls.push(args);
    if (args.operationId === 'files.create_local_upload') return { data: { data: { id: 'file-1', upload_urls: [{ url: 'https://upload/1', size: 5 }, { url: 'https://upload/2', size: 5 }] } } };
    return { data: { data: { id: 'file-1', upload_complete: true } } };
  }};
  const chunks = [];
  const result = await uploadLocalFile({ client, filePath, accountId: 'acct', folderId: 'folder', fetchImpl: async (url, options) => {
    chunks.push({ url, body: Buffer.from(options.body).toString(), acl: options.headers['x-amz-acl'] });
    return new Response(null, { status: 200 });
  }});
  assert.deepEqual(chunks, [
    { url: 'https://upload/1', body: '01234', acl: 'private' },
    { url: 'https://upload/2', body: '56789', acl: 'private' },
  ]);
  assert.equal(calls[0].body.data.file_size, 10);
  assert.equal(calls[1].operationId, 'files.show_file_upload_status');
  assert.equal(result.status.data.data.upload_complete, true);
});
