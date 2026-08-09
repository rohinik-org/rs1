import { createHash } from 'node:crypto'
import Ajv from 'ajv'
import type { OutputSchemaRef } from '@rohinik-org/execution-protocol-v1'

// ── Hash (parity with core/runtime/schema-registry) ──────────────────────────

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  const sorted = Object.keys(value as object).sort()
  return '{' + sorted.map(k => JSON.stringify(k) + ':' + canonicalJson((value as Record<string, unknown>)[k])).join(',') + '}'
}

export function computeSchemaHash(schema: Readonly<Record<string, unknown>>): string {
  return createHash('sha256').update(canonicalJson(schema)).digest('hex')
}

// ── Error ─────────────────────────────────────────────────────────────────────

export class SchemaHashMismatchError extends Error {
  readonly name = 'SchemaHashMismatchError'
  constructor(
    readonly expected: string,
    readonly received: string,
  ) {
    super(`Schema hash mismatch: expected ${expected}, received ${received}`)
  }
}

// ── Local validation result ───────────────────────────────────────────────────

export interface LocalValidationResult {
  readonly valid: boolean
  readonly errors?: Array<{ message?: string; instancePath?: string }>
}

// ── BoundSchema ───────────────────────────────────────────────────────────────

// ponytail: one Ajv instance shared across all BoundSchema instances
const ajv = new Ajv({ validateSchema: false, allErrors: true })

export interface BoundSchema<_T> {
  readonly schemaId: string
  readonly version: string
  readonly semanticHash: string
  readonly rawSchema: Readonly<Record<string, unknown>>
  ref(): OutputSchemaRef
  validateLocal(value: unknown): LocalValidationResult
}

export function defineJsonSchema<T>(
  schemaId: string,
  version: string,
  schema: Readonly<Record<string, unknown>>,
): BoundSchema<T> {
  const semanticHash = computeSchemaHash(schema)
  const validate = ajv.compile(schema)

  return {
    schemaId,
    version,
    semanticHash,
    rawSchema: schema,
    ref(): OutputSchemaRef {
      return { schemaId, version, semanticHash }
    },
    validateLocal(value: unknown): LocalValidationResult {
      const valid = validate(value) as boolean
      if (valid) return { valid: true }
      return {
        valid: false,
        errors: (validate.errors ?? []).map((e: { message?: string; instancePath?: string }) => ({
          message: e.message,
          instancePath: e.instancePath,
        })),
      }
    },
  }
}
