/**
 * check-protocol-compat.ts
 *
 * Checks current protocol schemas + OpenAPI against docs/compat/protocol-baseline.json.
 *
 * Strategy:
 *   1. Recompute schema hashes. If all match baseline — PASS immediately.
 *   2. If any hash changed — run structural diff.
 *      Additive-compatible changes PASS. Breaking changes FAIL with report.
 *
 * Run: npx tsx scripts/check-protocol-compat.ts
 * Exit 0 = compatible. Exit 1 = breaking change detected.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { createHash } from 'node:crypto'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const SCHEMA_DIR = resolve(REPO_ROOT, 'docs/protocol/v1/schemas')
const OPENAPI_FILE = resolve(REPO_ROOT, 'docs/protocol/v1/openapi.json')
const BASELINE_FILE = resolve(REPO_ROOT, 'docs/compat/protocol-baseline.json')

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }
type SchemaDoc = Record<string, JsonValue>

function sha256File(path: string): string {
  const h = createHash('sha256')
  h.update(readFileSync(path))
  return h.digest('hex')
}

interface Violation {
  kind: 'breaking' | 'warning'
  location: string
  message: string
}

const violations: Violation[] = []
const compatible: string[] = []

function breaking(location: string, message: string): void {
  violations.push({ kind: 'breaking', location, message })
}

function pass(message: string): void {
  compatible.push(message)
}

// ── Route compatibility ───────────────────────────────────────────────────────

function checkRoutes(baseline: SchemaDoc[], current: SchemaDoc[]): void {
  const baselineMap = new Map(baseline.map(r => [`${r.method} ${r.path}`, r]))
  const currentMap  = new Map(current.map(r =>  [`${r.method} ${r.path}`, r]))

  // Removed routes
  for (const [key] of baselineMap) {
    if (!currentMap.has(key)) {
      breaking(`routes`, `Route removed: ${key}`)
    }
  }

  // Added routes (compatible)
  for (const [key] of currentMap) {
    if (!baselineMap.has(key)) {
      pass(`New route added: ${key}`)
    }
  }

  // Status code changes on existing routes
  for (const [key, baseRoute] of baselineMap) {
    const currRoute = currentMap.get(key)
    if (!currRoute) continue
    const baseCodes = new Set(baseRoute.responseCodes as string[])
    const currCodes = new Set(currRoute.responseCodes as string[])
    for (const code of baseCodes) {
      if (!currCodes.has(code)) {
        breaking(`routes[${key}]`, `Response status removed: ${code}`)
      }
    }
    for (const code of currCodes) {
      if (!baseCodes.has(code)) {
        pass(`New response status on ${key}: ${code}`)
      }
    }
  }
}

// ── Schema compatibility ──────────────────────────────────────────────────────

function normalizeType(t: JsonValue): string {
  if (Array.isArray(t)) return (t as string[]).slice().sort().join('|')
  return String(t)
}

function checkSchemaProps(
  schemaName: string,
  baseRequired: string[],
  baseProps: Record<string, SchemaDoc>,
  currRequired: string[],
  currProps: Record<string, SchemaDoc>,
): void {
  const loc = `schemas[${schemaName}]`
  const baseReqSet = new Set(baseRequired)
  const currReqSet = new Set(currRequired)

  // Required field removed
  for (const f of baseReqSet) {
    if (!currProps[f]) breaking(loc, `Required field removed: ${f}`)
    else if (!currReqSet.has(f)) breaking(loc, `Required field became optional: ${f}`)
  }

  // Optional field became required
  for (const f of currReqSet) {
    if (!baseReqSet.has(f) && !baseProps[f]) {
      breaking(loc, `New field is required (breaking — consumers without it would fail): ${f}`)
    } else if (!baseReqSet.has(f) && baseProps[f]) {
      breaking(loc, `Optional field became required: ${f}`)
    }
  }

  // New optional fields (compatible)
  for (const f of Object.keys(currProps)) {
    if (!baseProps[f] && !currReqSet.has(f)) {
      pass(`${loc}: new optional field: ${f}`)
    }
  }

  // Type changes on existing fields
  for (const [field, baseDef] of Object.entries(baseProps)) {
    const currDef = currProps[field]
    if (!currDef) {
      if (!baseReqSet.has(field)) pass(`${loc}: optional field removed: ${field} (compatible — not required)`)
      // required field removal already caught above
      continue
    }

    if (baseDef.type !== undefined || currDef.type !== undefined) {
      const baseType = normalizeType(baseDef.type ?? 'any')
      const currType = normalizeType(currDef.type ?? 'any')
      if (baseType !== currType) {
        breaking(`${loc}.${field}`, `Type changed: ${baseType} → ${currType}`)
      }
    }

    if (baseDef.const !== undefined && currDef.const !== baseDef.const) {
      breaking(`${loc}.${field}`, `Const value changed: ${baseDef.const} → ${currDef.const}`)
    }
  }
}

function checkEnumDefs(schemaName: string, baseDefs: Record<string, string[]>, currDefs: Record<string, string[]>): void {
  const loc = `schemas[${schemaName}].$defs`
  for (const [defName, baseVariants] of Object.entries(baseDefs)) {
    const currVariants = currDefs[defName]
    if (!currVariants) { breaking(loc, `Enum type removed: ${defName}`); continue }
    const baseSet = new Set(baseVariants)
    const currSet = new Set(currVariants)
    for (const v of baseSet) {
      if (!currSet.has(v)) breaking(`${loc}[${defName}]`, `Enum variant removed: ${v}`)
    }
    for (const v of currSet) {
      if (!baseSet.has(v)) pass(`${loc}[${defName}]: new enum variant: ${v}`)
    }
  }
}

function checkSchemas(baseline: Record<string, SchemaDoc>, current: Record<string, SchemaDoc>): void {
  for (const [name, baseDef] of Object.entries(baseline)) {
    const currDef = current[name]
    if (!currDef) { breaking(`schemas`, `Schema removed: ${name}`); continue }

    checkSchemaProps(
      name,
      baseDef.required as string[] ?? [],
      baseDef.properties as Record<string, SchemaDoc> ?? {},
      currDef.required as string[] ?? [],
      currDef.properties as Record<string, SchemaDoc> ?? {},
    )

    if (baseDef.$defs) {
      checkEnumDefs(
        name,
        baseDef.$defs as Record<string, string[]>,
        (currDef.$defs ?? {}) as Record<string, string[]>,
      )
    }
  }

  for (const name of Object.keys(current)) {
    if (!baseline[name]) pass(`New schema added: ${name}`)
  }
}

// ── Error codes / states ──────────────────────────────────────────────────────

function checkStringSet(label: string, baseline: string[], current: string[]): void {
  const b = new Set(baseline)
  const c = new Set(current)
  for (const v of b) if (!c.has(v)) breaking(label, `Value removed: ${v}`)
  for (const v of c) if (!b.has(v)) pass(`${label}: new value: ${v}`)
}

// ── Schema semantic extraction (mirrors generate script) ─────────────────────

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

  const result: SchemaDoc = { title: (doc.title as string) ?? '', required, properties }
  const defs = doc.$defs as Record<string, SchemaDoc> | undefined
  if (defs) {
    const enumDefs: Record<string, string[]> = {}
    for (const [n, d] of Object.entries(defs)) {
      if (Array.isArray(d.enum)) enumDefs[n] = [...(d.enum as string[])].sort()
    }
    if (Object.keys(enumDefs).length) result.$defs = enumDefs as unknown as SchemaDoc
  }
  return result
}

// ── Main ──────────────────────────────────────────────────────────────────────

function run(): void {
  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8')) as SchemaDoc & {
    schemaHashes: Record<string, string>
    openapiHash: string
    routes: SchemaDoc[]
    schemas: Record<string, SchemaDoc>
    publicErrorCodes: string[]
    publicExecutionStates: string[]
  }

  // Step 1: hash check
  const schemaFiles = readdirSync(SCHEMA_DIR).filter(f => f.endsWith('.json')).sort()
  const currentHashes: Record<string, string> = {}
  const changedSchemas: string[] = []

  for (const file of schemaFiles) {
    const name = basename(file, '.json')
    const hash = sha256File(resolve(SCHEMA_DIR, file))
    currentHashes[name] = hash
    if (baseline.schemaHashes[name] !== hash) changedSchemas.push(name)
  }

  const openapiHash = sha256File(OPENAPI_FILE)
  const openapiChanged = openapiHash !== baseline.openapiHash

  if (changedSchemas.length === 0 && !openapiChanged) {
    console.log('✓ Protocol compatibility: all hashes match baseline. No structural diff needed.')
    process.exit(0)
  }

  console.log(`Hash changes detected (${changedSchemas.length} schema(s)${openapiChanged ? ' + openapi' : ''}). Running structural diff...\n`)

  // Step 2: structural diff
  // Parse current schemas
  const currentSchemas: Record<string, SchemaDoc> = {}
  for (const file of schemaFiles) {
    const name = basename(file, '.json')
    currentSchemas[name] = extractSchemaSematics(JSON.parse(readFileSync(resolve(SCHEMA_DIR, file), 'utf-8')) as SchemaDoc)
  }

  // Parse current routes from OpenAPI
  const openapi = JSON.parse(readFileSync(OPENAPI_FILE, 'utf-8')) as SchemaDoc
  const currentRoutes: SchemaDoc[] = []
  const paths = openapi.paths as Record<string, Record<string, SchemaDoc>>
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (!['get','post','put','delete','patch'].includes(method)) continue
      currentRoutes.push({
        method: method.toUpperCase(),
        path,
        responseCodes: Object.keys((op.responses as Record<string, unknown>) ?? {}).sort(),
      })
    }
  }

  checkRoutes(baseline.routes, currentRoutes)
  checkSchemas(baseline.schemas, currentSchemas)
  checkStringSet('publicErrorCodes', baseline.publicErrorCodes, (openapi as SchemaDoc & { publicErrorCodes?: string[] }).publicErrorCodes ?? baseline.publicErrorCodes)
  checkStringSet('publicExecutionStates', baseline.publicExecutionStates, baseline.publicExecutionStates)

  const breakingViolations = violations.filter(v => v.kind === 'breaking')

  if (compatible.length) {
    console.log('Compatible changes (pass):')
    for (const msg of compatible) console.log(`  ✓ ${msg}`)
    console.log()
  }

  if (breakingViolations.length === 0) {
    console.log(`✓ Protocol compatibility: ${changedSchemas.length} schema(s) changed, all changes are additive-compatible.`)
    process.exit(0)
  }

  console.error('✗ Protocol compatibility FAILED — breaking changes detected:\n')
  for (const v of breakingViolations) {
    console.error(`  [BREAKING] ${v.location}: ${v.message}`)
  }
  console.error(`\n${breakingViolations.length} breaking change(s). Bump protocol version or revert.`)
  process.exit(1)
}

run()
