import type { FastifyInstance } from 'fastify'
import {
  EXECUTION_PROTOCOL_VERSION,
  PublicErrorCode,
  type RegisterSchemaRequest,
  type PublicErrorEnvelope,
} from '@rohinik-org/execution-protocol-v1'
import {
  InMemorySchemaRegistry,
  SchemaRegistryError,
  type ISchemaRegistry,
} from '@rohinik-org/schema-registry'

// One shared registry per server instance — exported so async-executions can use it for binding.
export const schemaRegistry: ISchemaRegistry = new InMemorySchemaRegistry()

function makeError(code: PublicErrorCode, message: string): PublicErrorEnvelope {
  return { code, message, protocolVersion: EXECUTION_PROTOCOL_VERSION }
}

export function registerSchemaRoutes(app: FastifyInstance): void {

  // ── POST /v1/schemas ──────────────────────────────────────────────────────────
  // Register a new schema version. Returns 201 + SchemaRecord.
  // 409 if schemaId+version already exists.
  app.post<{ Body: RegisterSchemaRequest }>('/v1/schemas', async (req, reply) => {
    const body = req.body
    if (!body?.schemaId || !body?.version || !body?.schema) {
      reply.code(400).send(makeError(PublicErrorCode.INVALID_REQUEST, 'schemaId, version, and schema are required'))
      return
    }
    if (typeof body.schema !== 'object' || Array.isArray(body.schema) || body.schema === null) {
      reply.code(400).send(makeError(PublicErrorCode.INVALID_REQUEST, 'schema must be a non-null object'))
      return
    }

    try {
      const record = await schemaRegistry.register(body)
      reply.code(201).send(record)
    } catch (err) {
      if (err instanceof SchemaRegistryError && err.code === 'SCHEMA_ALREADY_EXISTS') {
        reply.code(409).send(makeError(PublicErrorCode.SCHEMA_ALREADY_EXISTS, err.message))
        return
      }
      throw err
    }
  })

  // ── GET /v1/schemas/:schemaId/:version ────────────────────────────────────────
  // Fetch a registered schema version. Returns 200 + SchemaRecord.
  // 404 if not registered.
  app.get<{ Params: { schemaId: string; version: string } }>(
    '/v1/schemas/:schemaId/:version',
    async (req, reply) => {
      const { schemaId, version } = req.params
      try {
        const record = await schemaRegistry.get(schemaId, version)
        reply.send(record)
      } catch (err) {
        if (err instanceof SchemaRegistryError && err.code === 'SCHEMA_NOT_FOUND') {
          reply.code(404).send(makeError(PublicErrorCode.SCHEMA_NOT_FOUND, err.message))
          return
        }
        throw err
      }
    },
  )

  // ── POST /v1/schemas/:schemaId/:version/validate ──────────────────────────────
  // Validate a value against a registered schema.
  // 200 always (outcome field carries VALID or INVALID); 404 if schema not registered.
  app.post<{
    Params: { schemaId: string; version: string }
    Body: { value: unknown }
  }>('/v1/schemas/:schemaId/:version/validate', async (req, reply) => {
    const { schemaId, version } = req.params
    if (!Object.prototype.hasOwnProperty.call(req.body ?? {}, 'value')) {
      reply.code(400).send(makeError(PublicErrorCode.INVALID_REQUEST, 'value field is required'))
      return
    }

    // Fetch stored hash to build a valid ref — caller doesn't need to supply it here
    let storedRecord
    try {
      storedRecord = await schemaRegistry.get(schemaId, version)
    } catch (err) {
      if (err instanceof SchemaRegistryError && err.code === 'SCHEMA_NOT_FOUND') {
        reply.code(404).send(makeError(PublicErrorCode.SCHEMA_NOT_FOUND, `Schema ${schemaId}@${version} not found`))
        return
      }
      throw err
    }

    const result = await schemaRegistry.validate(
      { schemaId, version, semanticHash: storedRecord.semanticHash },
      req.body.value,
    )
    reply.send(result)
  })
}
