// Built for neon-mcp (A-1). Loads the vendored Neon API description and validates requests and response bodies
// against it. A small, dependency-free subset of JSON Schema: $ref, allOf/oneOf/anyOf, type, nullable, enum,
// required, properties, items, minimum/maximum, pattern, minLength/maxLength. Request bodies are strict (an unknown field is an error — typos are the commonest
// request bug); response bodies are not (Neon adds fields often).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export const SPEC_PATH = fileURLToPath(new URL('../../vendor/neon-openapi/v2.yaml', import.meta.url));
const METHODS = ['get', 'put', 'post', 'delete', 'patch'];
let cached = null;

export function loadNeonSpec(file = SPEC_PATH) {
  if (file === SPEC_PATH && cached) return cached;
  const spec = parse(fs.readFileSync(file, 'utf8'));
  const routes = [];
  const byId = new Map();
  for (const [template, item] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op?.operationId) continue;
      const names = [];
      const source = template.replace(/[.*+?^$()|[\]\\]/g, '\\$&')
        .replace(/\\?\{([^}]+)\\?\}/g, (_m, name) => { names.push(name); return '([^/]+)'; });
      const route = { method: method.toUpperCase(), template, regex: new RegExp(`^${source}$`), names, op,
        operationId: op.operationId, parameters: [...(item.parameters || []), ...(op.parameters || [])] };
      routes.push(route);
      byId.set(op.operationId, route);
    }
  }
  // Literal segments win over parameters (e.g. /projects/shared before /projects/{project_id}).
  routes.sort((a, b) => a.names.length - b.names.length);
  const index = { spec, routes, byId };
  if (file === SPEC_PATH) cached = index;
  return index;
}

export function resolveRef(spec, schema) {
  let s = schema;
  for (let i = 0; s?.$ref && i < 20; i++) {
    const parts = s.$ref.replace(/^#\//, '').split('/');
    s = parts.reduce((node, key) => node?.[key], spec);
    if (!s) throw new Error(`Unresolvable $ref ${schema.$ref}`);
  }
  return s;
}

/** Every property name a schema allows, following $ref and allOf (for the strict unknown-field check). */
function allowedProps(spec, schema, out = new Set()) {
  const s = resolveRef(spec, schema);
  if (!s) return out;
  for (const k of Object.keys(s.properties || {})) out.add(k);
  for (const part of s.allOf || []) allowedProps(spec, part, out);
  if (s.additionalProperties) out.add('*');
  return out;
}

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);

export function validate(spec, schema, value, { at = 'body', strict = false, partOfAllOf = false } = {}) {
  const s = resolveRef(spec, schema);
  if (!s || Object.keys(s).length === 0) return [];
  const errors = [];
  if (value === null) return s.nullable ? [] : [`${at}: null is not allowed`];
  if (s.allOf) {
    for (const part of s.allOf) errors.push(...validate(spec, part, value, { at, strict, partOfAllOf: true }));
  }
  for (const key of ['oneOf', 'anyOf']) {
    if (!s[key]) continue;
    const ok = s[key].some((part) => validate(spec, part, value, { at, strict }).length === 0);
    if (!ok) errors.push(`${at}: matches none of the ${key} alternatives`);
  }
  const t = typeOf(value);
  if (s.type) {
    const fits = s.type === t || (s.type === 'number' && t === 'integer');
    if (!fits) return [...errors, `${at}: expected ${s.type}, got ${t}`];
  }
  if (typeof value === 'number' && s.minimum !== undefined && value < s.minimum) errors.push(`${at}: ${value} < minimum ${s.minimum}`);
  if (typeof value === 'number' && s.maximum !== undefined && value > s.maximum) errors.push(`${at}: ${value} > maximum ${s.maximum}`);
  if (typeof value === 'string') {
    if (s.pattern && !new RegExp(s.pattern, 'u').test(value)) errors.push(`${at}: does not match pattern ${s.pattern}`);
    if (s.minLength !== undefined && value.length < s.minLength) errors.push(`${at}: shorter than ${s.minLength}`);
    if (s.maxLength !== undefined && value.length > s.maxLength) errors.push(`${at}: longer than ${s.maxLength}`);
  }
  if (s.enum && !s.enum.includes(value)) errors.push(`${at}: ${JSON.stringify(value)} is not one of ${s.enum.join(', ')}`);
  if (t === 'object' && (s.properties || s.required || s.allOf)) {
    for (const r of s.required || []) if (!(r in value)) errors.push(`${at}.${r}: required field missing`);
    for (const [k, sub] of Object.entries(s.properties || {})) {
      if (k in value) errors.push(...validate(spec, sub, value[k], { at: `${at}.${k}`, strict }));
    }
    if (strict && !partOfAllOf && !s.oneOf && !s.anyOf) {
      const allowed = allowedProps(spec, s);
      if (!allowed.has('*')) for (const k of Object.keys(value)) if (!allowed.has(k)) errors.push(`${at}.${k}: unknown field`);
    }
    if (s.additionalProperties && typeof s.additionalProperties === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (!(k in (s.properties || {}))) errors.push(...validate(spec, s.additionalProperties, v, { at: `${at}.${k}`, strict }));
      }
    }
  }
  if (t === 'array' && s.items) value.forEach((v, i) => errors.push(...validate(spec, s.items, v, { at: `${at}[${i}]`, strict })));
  return errors;
}

export function findRoute(index, method, pathname) {
  for (const route of index.routes) {
    if (route.method !== method) continue;
    const m = route.regex.exec(pathname);
    if (m) return { route, params: Object.fromEntries(route.names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

/** → { operationId, params, errors } ; operationId is null when the method + path is not documented. */
export function validateRequest(index, { method, path, query = {}, body }) {
  const found = findRoute(index, method, path);
  if (!found) return { operationId: null, params: {}, errors: [`${method} ${path} is not in the Neon API description`] };
  const { route, params } = found;
  const errors = [];
  for (const raw of route.parameters) {
    const p = resolveRef(index.spec, raw);
    if (p.in !== 'query') continue;
    if (p.required && !(p.name in query)) errors.push(`query.${p.name}: required parameter missing`);
  }
  const known = new Set(route.parameters.map((raw) => resolveRef(index.spec, raw)).filter((p) => p.in === 'query').map((p) => p.name));
  for (const name of Object.keys(query)) if (!known.has(name)) errors.push(`query.${name}: unknown parameter`);
  const rb = route.op.requestBody ? resolveRef(index.spec, route.op.requestBody) : null;
  if (body !== undefined && !rb) errors.push('body: this operation takes no request body');
  if (rb) {
    if (body === undefined) { if (rb.required) errors.push('body: required request body missing'); }
    else errors.push(...validate(index.spec, rb.content?.['application/json']?.schema, body, { at: 'body', strict: true }));
  }
  return { operationId: route.operationId, params, errors };
}

export function responseSchema(index, operationId, status) {
  const route = index.byId.get(operationId);
  if (!route) throw new Error(`Unknown Neon operationId: ${operationId}`);
  const res = route.op.responses[String(status)] ?? route.op.responses.default;
  if (!res) return null;
  return resolveRef(index.spec, res).content?.['application/json']?.schema ?? null;
}

export function validateResponse(index, operationId, status, body) {
  const schema = responseSchema(index, operationId, status);
  if (!schema) return body === undefined || body === null ? [] : [`${operationId} ${status}: no JSON body is documented`];
  return validate(index.spec, schema, body, { at: `${operationId} ${status}` });
}
