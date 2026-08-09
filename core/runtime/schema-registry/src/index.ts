import { createHash } from 'node:crypto'
import Ajv from 'ajv'
import type {
  SchemaRecord,
  RegisterSchemaRequest,
  ValidationOutcome,
  ValidateAgainstSchemaResponse,
  OutputSchemaRef,
} from '@rohinik-org/execution-protocol-v1'

// ── Schema hash ───────────────────────────────────────────────────────────────

/**
 * Canonical SHA-256 hash of a JSON Schema document.
 *
 * Canonical form: JSON.stringify with keys sorted, no extra whitespace.
 * This is stable across serialisations of the same logical schema.
 */
export function computeSchemaHash(schema: Readonly<Record<string, unknown>>): string {
  return createHash('sha256').update(canonicalJson(schema)).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  const sorted = Object.keys(value as object).sort()
  return '{' + sorted.map(k => JSON.stringify(k) + ':' + canonicalJson((value as Record<string, unknown>)[k])).join(',') + '}'
}

// ── Registry error ────────────────────────────────────────────────────────────

export class SchemaRegistryError extends Error {
  constructor(
    readonly code: 'SCHEMA_NOT_FOUND' | 'SCHEMA_HASH_MISMATCH' | 'SCHEMA_ALREADY_EXISTS',
    message: string,
  ) {
    super(message)
    this.name = 'SchemaRegistryError'
  }
}

// ── Registry interface ────────────────────────────────────────────────────────

export interface ISchemaRegistry {
  /**
   * Register a schema version. Computes and stores the canonical hash.
   * Throws SCHEMA_ALREADY_EXISTS if schemaId+version already registered.
   */
  register(request: RegisterSchemaRequest): Promise<SchemaRecord>

  /**
   * Fetch a registered schema version.
   * Throws SCHEMA_NOT_FOUND if not registered.
   */
  get(schemaId: string, version: string): Promise<SchemaRecord>

  /**
   * Validate a value against a registered schema.
   * Throws SCHEMA_NOT_FOUND if not registered.
   * Throws SCHEMA_HASH_MISMATCH if ref.semanticHash doesn't match stored hash.
   */
  validate(ref: OutputSchemaRef, value: unknown): Promise<ValidateAgainstSchemaResponse>

  /**
   * Check whether a schema version exists without throwing.
   */
  has(schemaId: string, version: string): Promise<boolean>
}

// ── In-memory implementation ──────────────────────────────────────────────────

export class InMemorySchemaRegistry implements ISchemaRegistry {
  private readonly store = new Map<string, SchemaRecord>()
  // ponytail: one Ajv instance per registry; compiled validators cached by key
  // validateSchema:false — callers may supply draft-07/draft-2020 schemas; Ajv 8
  // doesn't bundle older meta-schemas, so we skip meta-validation here.
  // Schema correctness is the caller's responsibility.
  private readonly ajv = new Ajv({ strict: false, allErrors: true, validateSchema: false })

  private static key(schemaId: string, version: string): string {
    return `${schemaId}@${version}`
  }

  async register(request: RegisterSchemaRequest): Promise<SchemaRecord> {
    const k = InMemorySchemaRegistry.key(request.schemaId, request.version)
    if (this.store.has(k)) {
      throw new SchemaRegistryError(
        'SCHEMA_ALREADY_EXISTS',
        `Schema ${request.schemaId}@${request.version} already registered`,
      )
    }

    const semanticHash = computeSchemaHash(request.schema)
    const record: SchemaRecord = {
      schemaId:     request.schemaId,
      version:      request.version,
      semanticHash,
      registeredAt: new Date().toISOString(),
      schema:       request.schema,
    }

    this.store.set(k, record)
    return record
  }

  async get(schemaId: string, version: string): Promise<SchemaRecord> {
    const record = this.store.get(InMemorySchemaRegistry.key(schemaId, version))
    if (!record) {
      throw new SchemaRegistryError(
        'SCHEMA_NOT_FOUND',
        `Schema ${schemaId}@${version} not found`,
      )
    }
    return record
  }

  async has(schemaId: string, version: string): Promise<boolean> {
    return this.store.has(InMemorySchemaRegistry.key(schemaId, version))
  }

  async validate(ref: OutputSchemaRef, value: unknown): Promise<ValidateAgainstSchemaResponse> {
    const record = await this.get(ref.schemaId, ref.version)

    if (record.semanticHash !== ref.semanticHash) {
      throw new SchemaRegistryError(
        'SCHEMA_HASH_MISMATCH',
        `Schema ${ref.schemaId}@${ref.version} hash mismatch: ` +
        `expected ${ref.semanticHash}, stored ${record.semanticHash}`,
      )
    }

    const cacheKey = InMemorySchemaRegistry.key(ref.schemaId, ref.version)
    let validate = this.ajv.getSchema(cacheKey)
    if (!validate) {
      validate = this.ajv.compile(record.schema)
      // cache under the registry key so subsequent calls skip compile
      this.ajv.addSchema(record.schema, cacheKey)
      validate = this.ajv.getSchema(cacheKey)!
    }

    const valid = validate(value)
    const errors: string[] = valid
      ? []
      : (validate.errors ?? []).map(e => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`)

    const outcome: ValidationOutcome = valid ? 'VALID' : 'INVALID'

    return {
      schemaId:     ref.schemaId,
      version:      ref.version,
      semanticHash: record.semanticHash,
      outcome,
      errorCount:   errors.length,
      errors,
    }
  }
}
