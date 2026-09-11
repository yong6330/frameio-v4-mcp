import { open, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

export async function uploadLocalFile({ client, filePath, accountId, folderId, name, fetchImpl = fetch }) {
  const absolutePath = resolve(filePath);
  const details = await stat(absolutePath);
  if (!details.isFile() || details.size < 1) throw new Error('Upload path must be a non-empty regular file');

  const created = await client.invoke({
    operationId: 'files.create_local_upload',
    path: { account_id: accountId, folder_id: folderId },
    body: { data: { name: name || basename(absolutePath), file_size: details.size } },
  });
  const file = created.data?.data;
  if (!file?.id || !Array.isArray(file.upload_urls)) throw new Error('Frame.io did not return file ID and upload URLs');
  if (file.upload_urls.reduce((sum, part) => sum + part.size, 0) !== details.size) throw new Error('Frame.io upload chunk sizes do not match the local file');

  const handle = await open(absolutePath, 'r');
  try {
    let offset = 0;
    for (const part of file.upload_urls) {
      const chunk = Buffer.allocUnsafe(part.size);
      const { bytesRead } = await handle.read(chunk, 0, part.size, offset);
      if (bytesRead !== part.size) throw new Error(`Short read at byte ${offset}`);
      const response = await fetchImpl(part.url, { method: 'PUT', headers: { 'x-amz-acl': 'private' }, body: chunk });
      if (!response.ok) throw new Error(`Presigned upload failed (${response.status}) at byte ${offset}`);
      offset += part.size;
    }
  } finally {
    await handle.close();
  }

  const status = await client.invoke({ operationId: 'files.show_file_upload_status', path: { account_id: accountId, file_id: file.id } });
  return { file, status };
}
