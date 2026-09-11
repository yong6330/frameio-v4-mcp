import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadCatalog, searchOperations, getOperation, getOperationSchema } from '../src/catalog.js';

const specPath = fileURLToPath(new URL('../openapi.json', import.meta.url));

test('indexes all 97 unique Frame.io V4 operations', () => {
  const catalog = loadCatalog(specPath);
  assert.equal(catalog.operations.length, 97);
  assert.equal(new Set(catalog.operations.map(({ operationId }) => operationId)).size, 97);
});

test('filters operations by tag and method', () => {
  const catalog = loadCatalog(specPath);
  assert(searchOperations(catalog, { tag: 'Files' }).every(({ tags }) => tags.includes('Files')));
  assert(searchOperations(catalog, { method: 'DELETE' }).every(({ method }) => method === 'DELETE'));
});

test('rejects unknown operation IDs', () => {
  const catalog = loadCatalog(specPath);
  assert.throws(() => getOperation(catalog, 'made.up'), /Unknown Frame\.io operation/);
});

test('returns referenced input schema definitions', () => {
  const schema = getOperationSchema(loadCatalog(specPath), 'comments.create');
  assert.equal(schema.method, 'POST');
  assert(schema.definitions.CreateCommentParams);
  assert(schema.definitions.TimeStamp);
});
