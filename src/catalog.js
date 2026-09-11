import { readFileSync } from 'node:fs';

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

export function loadCatalog(specPath) {
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const operations = [];
  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!METHODS.has(method) || !operation.operationId) continue;
      operations.push({
        operationId: operation.operationId,
        method: method.toUpperCase(),
        path,
        summary: operation.summary ?? '',
        description: operation.description ?? '',
        tags: operation.tags ?? [],
        parameters: operation.parameters ?? [],
        requestBody: operation.requestBody ?? null,
        responses: operation.responses ?? {},
      });
    }
  }
  return { spec, operations };
}

export function searchOperations(catalog, { query = '', tag, method } = {}) {
  const needle = query.toLowerCase();
  return catalog.operations.filter(operation => {
    const text = [operation.operationId, operation.method, operation.path, operation.summary, operation.description, ...operation.tags].join(' ').toLowerCase();
    return (!needle || text.includes(needle))
      && (!tag || operation.tags.some(value => value.toLowerCase() === tag.toLowerCase()))
      && (!method || operation.method === method.toUpperCase());
  });
}

export function getOperation(catalog, operationId) {
  const operation = catalog.operations.find(item => item.operationId === operationId);
  if (!operation) throw new Error(`Unknown Frame.io operation: ${operationId}`);
  return operation;
}

export function getOperationSchema(catalog, operationId) {
  const operation = getOperation(catalog, operationId);
  const input = {
    operationId: operation.operationId,
    method: operation.method,
    path: operation.path,
    summary: operation.summary,
    description: operation.description,
    tags: operation.tags,
    parameters: operation.parameters,
    requestBody: operation.requestBody,
  };
  const definitions = {};
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string' && value.$ref.startsWith('#/components/schemas/')) {
      const name = value.$ref.slice('#/components/schemas/'.length);
      if (!definitions[name] && catalog.spec.components?.schemas?.[name]) {
        definitions[name] = catalog.spec.components.schemas[name];
        visit(definitions[name]);
      }
    }
    for (const nested of Object.values(value)) visit(nested);
  };
  visit(input);
  return { ...input, definitions };
}
