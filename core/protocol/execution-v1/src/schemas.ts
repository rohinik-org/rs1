/**
 * JSON Schema definitions for all /v1/executions/* DTOs.
 * These are the authoritative schemas; docs/protocol/v1/ artifacts are derived from them.
 */

export const SubmitExecutionRequestSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rohinik.org/schemas/execution-protocol/v1/SubmitExecutionRequest.json',
  title: 'SubmitExecutionRequest',
  type: 'object',
  required: ['content', 'contentType'],
  additionalProperties: false,
  properties: {
    content:       { type: 'string', minLength: 1 },
    contentType:   { type: 'string', minLength: 1 },
    intentHint:    { type: 'string' },
    context:       { type: 'object' },
    constraints: {
      type: 'object',
      additionalProperties: false,
      properties: {
        allowReasoning: { type: 'boolean' },
        timeoutMs:      { type: 'integer', minimum: 1 },
      },
    },
    idempotencyKey: { type: 'string', maxLength: 256 },
    outputSchemaRef: {
      type: 'object',
      required: ['schemaId', 'version', 'semanticHash'],
      additionalProperties: false,
      properties: {
        schemaId:     { type: 'string', minLength: 1 },
        version:      { type: 'string', minLength: 1 },
        semanticHash: { type: 'string', minLength: 64, maxLength: 64 },
      },
    },
  },
} as const

export const SubmitExecutionResponseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rohinik.org/schemas/execution-protocol/v1/SubmitExecutionResponse.json',
  title: 'SubmitExecutionResponse',
  type: 'object',
  required: ['executionId', 'idempotencyKey', 'state', 'protocolVersion', 'submittedAt', 'idempotent'],
  additionalProperties: false,
  properties: {
    executionId:      { type: 'string' },
    idempotencyKey:   { type: ['string', 'null'] },
    state:            { $ref: '#/$defs/PublicExecutionState' },
    protocolVersion:  { type: 'string', const: 'v1' },
    submittedAt:      { type: 'string', format: 'date-time' },
    idempotent:       { type: 'boolean' },
  },
  $defs: { PublicExecutionState: publicExecutionStateSchema() },
} as const

export const ExecutionStatusResponseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rohinik.org/schemas/execution-protocol/v1/ExecutionStatusResponse.json',
  title: 'ExecutionStatusResponse',
  type: 'object',
  required: ['executionId', 'state', 'protocolVersion', 'submittedAt', 'startedAt', 'completedAt', 'cancelledAt', 'terminal'],
  additionalProperties: false,
  properties: {
    executionId:     { type: 'string' },
    state:           { $ref: '#/$defs/PublicExecutionState' },
    protocolVersion: { type: 'string', const: 'v1' },
    submittedAt:     { type: 'string', format: 'date-time' },
    startedAt:       { type: ['string', 'null'], format: 'date-time' },
    completedAt:     { type: ['string', 'null'], format: 'date-time' },
    cancelledAt:     { type: ['string', 'null'], format: 'date-time' },
    terminal:        { type: 'boolean' },
  },
  $defs: { PublicExecutionState: publicExecutionStateSchema() },
} as const

export const ExecutionResultResponseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rohinik.org/schemas/execution-protocol/v1/ExecutionResultResponse.json',
  title: 'ExecutionResultResponse',
  type: 'object',
  required: ['executionId', 'state', 'output', 'totalDurationMs', 'completedAt'],
  additionalProperties: false,
  properties: {
    executionId:     { type: 'string' },
    state:           { $ref: '#/$defs/PublicExecutionState' },
    output:          {},
    contentType:     { type: 'string' },
    totalDurationMs: { type: 'integer', minimum: 0 },
    completedAt:     { type: 'string', format: 'date-time' },
    validationResult: {
      type: 'object',
      required: ['outcome', 'errorCount'],
      additionalProperties: false,
      properties: {
        outcome:    { type: 'string', enum: ['VALID', 'INVALID', 'NOT_REQUESTED', 'NOT_EVALUATED'] },
        firstError: { type: 'string' },
        errorCount: { type: 'integer', minimum: 0 },
        schemaRef: {
          type: 'object',
          required: ['schemaId', 'version', 'semanticHash'],
          additionalProperties: false,
          properties: {
            schemaId:     { type: 'string' },
            version:      { type: 'string' },
            semanticHash: { type: 'string' },
          },
        },
      },
    },
  },
  $defs: { PublicExecutionState: publicExecutionStateSchema() },
} as const

export const CancelExecutionRequestSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rohinik.org/schemas/execution-protocol/v1/CancelExecutionRequest.json',
  title: 'CancelExecutionRequest',
  type: 'object',
  additionalProperties: false,
  properties: {
    reason: { type: 'string' },
  },
} as const

export const CancelExecutionResponseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rohinik.org/schemas/execution-protocol/v1/CancelExecutionResponse.json',
  title: 'CancelExecutionResponse',
  type: 'object',
  required: ['executionId', 'state', 'cancelAccepted'],
  additionalProperties: false,
  properties: {
    executionId:    { type: 'string' },
    state:          { $ref: '#/$defs/PublicExecutionState' },
    cancelAccepted: { type: 'boolean' },
  },
  $defs: { PublicExecutionState: publicExecutionStateSchema() },
} as const

export const ExecutionEvidenceResponseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rohinik.org/schemas/execution-protocol/v1/ExecutionEvidenceResponse.json',
  title: 'ExecutionEvidenceResponse',
  type: 'object',
  required: ['executionId', 'entries'],
  additionalProperties: false,
  properties: {
    executionId: { type: 'string' },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind', 'stepId', 'detail', 'recordedAt'],
        additionalProperties: false,
        properties: {
          kind:       { type: 'string' },
          stepId:     { type: ['string', 'null'] },
          detail:     {},
          recordedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
} as const

export const PublicErrorEnvelopeSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rohinik.org/schemas/execution-protocol/v1/PublicErrorEnvelope.json',
  title: 'PublicErrorEnvelope',
  type: 'object',
  required: ['code', 'message', 'protocolVersion'],
  additionalProperties: false,
  properties: {
    code:            { type: 'string' },
    message:         { type: 'string' },
    executionId:     { type: 'string' },
    protocolVersion: { type: 'string', const: 'v1' },
    detail:          {},
  },
} as const

function publicExecutionStateSchema() {
  return {
    type: 'string',
    enum: ['QUEUED', 'ADMITTED', 'RUNNING', 'WAITING', 'CANCELLING', 'COMPLETED', 'FAILED', 'CANCELLED'],
  } as const
}

// ── Schema registry DTOs (Stage 16C) ─────────────────────────────────────────

export const RegisterSchemaRequestSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rohinik.org/schemas/execution-protocol/v1/RegisterSchemaRequest.json',
  title: 'RegisterSchemaRequest',
  type: 'object',
  required: ['schemaId', 'version', 'schema'],
  additionalProperties: false,
  properties: {
    schemaId: { type: 'string', minLength: 1 },
    version:  { type: 'string', minLength: 1 },
    schema:   { type: 'object' },
  },
} as const

export const SchemaRecordSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rohinik.org/schemas/execution-protocol/v1/SchemaRecord.json',
  title: 'SchemaRecord',
  type: 'object',
  required: ['schemaId', 'version', 'semanticHash', 'registeredAt', 'schema'],
  additionalProperties: false,
  properties: {
    schemaId:     { type: 'string' },
    version:      { type: 'string' },
    semanticHash: { type: 'string' },
    registeredAt: { type: 'string', format: 'date-time' },
    schema:       { type: 'object' },
  },
} as const

export const ValidateAgainstSchemaRequestSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rohinik.org/schemas/execution-protocol/v1/ValidateAgainstSchemaRequest.json',
  title: 'ValidateAgainstSchemaRequest',
  type: 'object',
  required: ['value'],
  additionalProperties: false,
  properties: {
    value: {},
  },
} as const

export const ValidateAgainstSchemaResponseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rohinik.org/schemas/execution-protocol/v1/ValidateAgainstSchemaResponse.json',
  title: 'ValidateAgainstSchemaResponse',
  type: 'object',
  required: ['schemaId', 'version', 'semanticHash', 'outcome', 'errorCount', 'errors'],
  additionalProperties: false,
  properties: {
    schemaId:     { type: 'string' },
    version:      { type: 'string' },
    semanticHash: { type: 'string' },
    outcome:      { type: 'string', enum: ['VALID', 'INVALID', 'NOT_REQUESTED', 'NOT_EVALUATED'] },
    errorCount:   { type: 'integer', minimum: 0 },
    errors:       { type: 'array', items: { type: 'string' } },
  },
} as const

export const ALL_SCHEMAS = [
  SubmitExecutionRequestSchema,
  SubmitExecutionResponseSchema,
  ExecutionStatusResponseSchema,
  ExecutionResultResponseSchema,
  CancelExecutionRequestSchema,
  CancelExecutionResponseSchema,
  ExecutionEvidenceResponseSchema,
  PublicErrorEnvelopeSchema,
  RegisterSchemaRequestSchema,
  SchemaRecordSchema,
  ValidateAgainstSchemaRequestSchema,
  ValidateAgainstSchemaResponseSchema,
] as const
