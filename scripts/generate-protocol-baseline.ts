/**
 * generate-protocol-baseline.ts
 *
 * Reads docs/protocol/v1/schemas/ and docs/protocol/v1/openapi.json.
 * Writes docs/compat/protocol-baseline.json.
 *
 * Run: npx tsx scripts/generate-protocol-baseline.ts
 */

import { readFileSync, readdirSync, writeFileSync, createReadStream } from 'node:fs'
import { resolve, basename } from 'node:path'
import { createHash } from 'node:crypto'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const SCHEMA_DIR = resolve(REPO_ROOT, 'docs/protocol/v1/schemas')
const OPENAPI_FILE = resolve(REPO_ROOT, 'docs/protocol/v1/openapi.json')
const OUT_FILE = resolve(REPO_ROOT, 'docs/compat/protocol-baseline.json')

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }
type SchemaDoc = Record<string, JsonValue>

function sha256File(path: string): string {
  const h = createHash('sha256')
  h.update(readFileSync(path))
  return h.digest('hex')
}

function extractSchemaSematics(doc: SchemaDoc): SchemaDoc {
  const required = (doc.required as string[] | undefined) ?? []
  const rawProps = (doc.properties as Record<string, SchemaDoc> | undefined) ?? {}
  const properties: Record<string, SchemaDoc> = {}

  for (const [prop, defn] of Object.entries(rawProps)) {
    const info: SchemaDoc = {}
    if (defn.type !== undefined) info.type = defn.type
    if (defn.$ref !== undefined) info.$ref = defn.$ref
    if (Array.isArray(defn.enum)) info.enum = [...(defn.enum as string[])].sort()
    if (defn.const !== undefined) info.const = defn.const
    if (defn.type === 'object' && defn.properties) {
      info.properties = Object.keys(defn.properties as Record<string, unknown>).reduce<Record<string, SchemaDoc>>((acc, k) => { acc[k] = {}; return acc }, {})
    }
    if (defn.type === 'array' && defn.items) {
      const items = defn.items as SchemaDoc
      info.items = {
        required: (items.required as string[] | undefined) ?? [],
        properties: Object.keys((items.properties as Record<string, unknown> | undefined) ?? {}).reduce<Record<string, SchemaDoc>>((acc, k) => { acc[k] = {}; return acc }, {}),
      }
    }
    properties[prop] = info
  }

  const result: SchemaDoc = {
    title: (doc.title as string) ?? '',
    required,
    properties,
  }

  const defs = doc.$defs as Record<string, SchemaDoc> | undefined
  if (defs) {
    const enumDefs: Record<string, string[]> = {}
    for (const [name, def] of Object.entries(defs)) {
      if (Array.isArray(def.enum)) enumDefs[name] = [...(def.enum as string[])].sort()
    }
    if (Object.keys(enumDefs).length) result.$defs = enumDefs as unknown as SchemaDoc
  }

  return result
}

function run(): void {
  const openapi = JSON.parse(readFileSync(OPENAPI_FILE, 'utf-8')) as SchemaDoc
  const paths = openapi.paths as Record<string, Record<string, SchemaDoc>>

  const routes: SchemaDoc[] = []
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (!['get','post','put','delete','patch'].includes(method)) continue
      routes.push({
        method: method.toUpperCase(),
        path,
        responseCodes: Object.keys((op.responses as Record<string, unknown>) ?? {}).sort(),
      })
    }
  }
  routes.sort((a, b) => String(a.path).localeCompare(String(b.path)) || String(a.method).localeCompare(String(b.method)))

  const schemaFiles = readdirSync(SCHEMA_DIR).filter(f => f.endsWith('.json')).sort()
  const schemaHashes: Record<string, string> = {}
  const schemas: Record<string, SchemaDoc> = {}

  for (const file of schemaFiles) {
    const name = basename(file, '.json')
    const path = resolve(SCHEMA_DIR, file)
    schemaHashes[name] = sha256File(path)
    schemas[name] = extractSchemaSematics(JSON.parse(readFileSync(path, 'utf-8')) as SchemaDoc)
  }

  const baseline: SchemaDoc = {
    baselineTag: 'v0.16.0-stage16a',
    generatedAt: new Date().toISOString(),
    protocolVersion: 'v1',
    packageVersion: '1.0.0',
    openapiHash: sha256File(OPENAPI_FILE),
    schemaHashes,
    routes,
    schemas,
    publicErrorCodes: ['EXECUTION_NOT_FOUND','RESULT_NOT_READY','IDEMPOTENCY_CONFLICT','INVALID_REQUEST','INTERNAL_ERROR'].sort(),
    publicExecutionStates: ['QUEUED','ADMITTED','RUNNING','WAITING','CANCELLING','COMPLETED','FAILED','CANCELLED'].sort(),
    terminalStates: ['COMPLETED','FAILED','CANCELLED'].sort(),
    compatibilityPolicy: {
      breaking: [
        'route or method removal',
        'required request or response field removal',
        'optional field becoming required',
        'property type narrowing',
        'enum variant removal',
        'response status removal',
        'public error-code removal or semantic reassignment',
      ],
      compatible: [
        'new optional fields',
        'new routes',
        'new response status where existing behavior remains valid',
        'new enum values (callers must tolerate unknown additions per protocol contract)',
      ],
    },
  }

  writeFileSync(OUT_FILE, JSON.stringify(baseline, null, 2) + '\n')
  console.log(`Protocol baseline written: ${OUT_FILE}`)
}

run()
