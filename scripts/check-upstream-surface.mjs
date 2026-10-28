#!/usr/bin/env node
// WF-014: surface check for the OpenWA routes the BFF depends on.
//
// Reads `OpenWA/openapi.json` (the pinned submodule tag) and digs out a digest of
// every route listed in `scripts/upstream-surface.json`: existence, required
// params, required request-body fields, and the required/property shape of key
// responses. Compares that digest with the committed snapshot
// `scripts/upstream-surface.snapshot.json`; any drift fails with a line diff, so
// bumping the OpenWA pin without vetting the contract never slips through CI.
//
// Usage:
//   node scripts/check-upstream-surface.mjs             # check (CI default)
//   node scripts/check-upstream-surface.mjs --update    # regenerate the snapshot
//   node scripts/check-upstream-surface.mjs --manifest scripts/upstream-surface.json
//
// Response digests keep two depth levels: property names and the `required` list.
// Renamed or dropped fields it catches; type-level drift it deliberately ignores
// (the BFF types are owned here, runtime e2e covers behaviour).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mi = process.argv.indexOf('--manifest');
const manifestPath = mi > 0 ? process.argv[mi + 1] : join(root, 'scripts/upstream-surface.json');
const snapshotPath = join(root, 'scripts/upstream-surface.snapshot.json');
const openapiPath = join(root, 'OpenWA/openapi.json');
const UPDATE = process.argv.includes('--update');

const fail = (msg) => {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
};

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!existsSync(openapiPath)) {
  fail(`no OpenAPI spec at ${openapiPath} — init the OpenWA submodule: git submodule update --init OpenWA`);
}
const spec = JSON.parse(readFileSync(openapiPath, 'utf8'));

// Resolve a $ref chain one level at a time (name kept for digest stability).
function deref(node, seen = new Set()) {
  if (typeof node !== 'object' || node === null) return node;
  if (typeof node.$ref === 'string') {
    const name = node.$ref;
    if (seen.has(name)) return {}; // cycle guard, digest drops repeats
    seen.add(name);
    const target = name.split('/').slice(1).reduce((acc, k) => (acc == null ? acc : acc[k]), spec);
    return target == null ? {} : deref(target, seen);
  }
  return node;
}

const schemaDigest = (schema) => {
  const s = deref(schema);
  if (!s || typeof s !== 'object') return null;
  const digests = {};
  for (const [prop, sub] of Object.entries(s.properties ?? {})) {
    const d = deref(sub);
    digests[prop] = d.items ? { type: d.type, items: deref(d.items).type ?? null } : { type: d.type ?? null };
  }
  return { required: s.required ?? [], properties: digests };
};

function digestOperation(route, method, op) {
  const params = [];
  for (const raw of op.parameters ?? []) {
    const p = deref(raw);
    if (p.in === 'path' && p.required) params.push(p.name);
  }
  const bodyRef = op.requestBody ?? {};
  const body = deref(bodyRef['$ref'] ? bodyRef : bodyRef);
  let request = null;
  const schema =
    body?.content?.['application/json']?.schema ?? body?.content?.['application/x-www-form-urlencoded']?.schema ?? null;
  if (schema) request = schemaDigest(schema);
  const responses = {};
  for (const [status, r] of Object.entries(op.responses ?? {})) {
    if (!/^[2]/.test(status)) continue;
    const content = deref(r);
    const respSchema = content?.content?.['application/json']?.schema;
    if (respSchema) {
      const d = schemaDigest(respSchema);
      if (d) responses[status] = d;
    }
  }
  return { method, path: route, summary: op.summary ?? null, pathParams: params, requestBody: request, responses };
}

const snap = { version: manifest.version ?? 1, generatedBy: 'scripts/check-upstream-surface.mjs', routes: [] };
const missing = [];
for (const entry of manifest.routes) {
  const [method, pathRaw] = entry.split(' ');
  const path = `/${pathRaw.replace(/^\//, '')}`;
  const item = spec.paths?.[path];
  if (!item?.[method.toLowerCase()]) {
    missing.push(`${method} ${path}`);
    continue;
  }
  snap.routes.push(digestOperation(path, method.toLowerCase(), item[method.toLowerCase()]));
}
if (missing.length) fail(`routes missing from OpenWA/openapi.json:\n  ${missing.join('\n  ')}`);

const canonical = `${JSON.stringify(snap, null, 2)}\n`;

if (UPDATE) {
  writeFileSync(snapshotPath, canonical);
  process.stdout.write(`snapshot updated: ${snapshotPath} (${snap.routes.length} routes)\n`);
  process.exit(0);
}

if (!existsSync(snapshotPath)) {
  fail(`missing snapshot ${snapshotPath} — run with --update once and commit it`);
}
const committed = readFileSync(snapshotPath, 'utf8');
if (committed === canonical) {
  process.stdout.write(`upstream surface: ${snap.routes.length} BFF routes match the snapshot\n`);
  process.exit(0);
}

// Readable drift report: show only routes whose digest changed.
import { createHash } from 'node:crypto';
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 10);
const committedSnap = JSON.parse(committed);
const committedByKey = new Map(committedSnap.routes.map((r) => [`${r.method.toUpperCase()} ${r.path}`, JSON.stringify(r, null, 2)]));
const newByKey = new Map(snap.routes.map((r) => [`${r.method.toUpperCase()} ${r.path}`, JSON.stringify(r, null, 2)]));
const lines = [];
for (const [key, before] of committedByKey) {
  const after = newByKey.get(key);
  if (after == null) lines.push(`route removed upstream: ${key}`);
  else if (hash(after) !== hash(before)) lines.push(`route changed: ${key}\n  before: ${before}\n  after:  ${after}`);
}
for (const [key] of newByKey) if (!committedByKey.has(key)) lines.push(`route added upstream: ${key}`);
process.stderr.write(
  [
    `upstream surface drift detected at pinned OpenWA (${snap.routes.length} BFF routes checked):`,
    '',
    ...lines.map((l) => `  - ${l}`),
    '',
    'If the change is intentional (vetted in the rebase checklist from scripts/upstream-watch),',
    `run: node scripts/check-upstream-surface.mjs --update, then commit ${snapshotPath}.`,
    '',
  ].join('\n'),
);
process.exit(1);
