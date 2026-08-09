import { describe, it, expect } from 'vitest'
import {
  EXECUTION_PROTOCOL_VERSION,
  PublicExecutionState,
  PUBLIC_TERMINAL_STATES,
  PublicErrorCode,
  PROTOCOL_CONSTANTS,
  ValidationOutcome,
} from '../index.js'
import { ALL_SCHEMAS } from '../schemas.js'

describe('execution-protocol-v1 constants', () => {
  it('protocol version is v1', () => {
    expect(EXECUTION_PROTOCOL_VERSION).toBe('v1')
  })

  it('all 8 public states defined', () => {
    const states = Object.values(PublicExecutionState)
    expect(states).toHaveLength(8)
    expect(states).toContain('QUEUED')
    expect(states).toContain('ADMITTED')
    expect(states).toContain('CANCELLING')
  })

  it('terminal states are COMPLETED FAILED CANCELLED', () => {
    expect(PUBLIC_TERMINAL_STATES.has('COMPLETED')).toBe(true)
    expect(PUBLIC_TERMINAL_STATES.has('FAILED')).toBe(true)
    expect(PUBLIC_TERMINAL_STATES.has('CANCELLED')).toBe(true)
    expect(PUBLIC_TERMINAL_STATES.has('RUNNING')).toBe(false)
  })

  it('all error codes defined including Stage 16C codes', () => {
    expect(PublicErrorCode.EXECUTION_NOT_FOUND).toBe('EXECUTION_NOT_FOUND')
    expect(PublicErrorCode.RESULT_NOT_READY).toBe('RESULT_NOT_READY')
    expect(PublicErrorCode.IDEMPOTENCY_CONFLICT).toBe('IDEMPOTENCY_CONFLICT')
    expect(PublicErrorCode.PROTOCOL_VERSION_MISMATCH).toBe('PROTOCOL_VERSION_MISMATCH')
    expect(PublicErrorCode.SCHEMA_NOT_FOUND).toBe('SCHEMA_NOT_FOUND')
    expect(PublicErrorCode.SCHEMA_HASH_MISMATCH).toBe('SCHEMA_HASH_MISMATCH')
    expect(PublicErrorCode.SCHEMA_ALREADY_EXISTS).toBe('SCHEMA_ALREADY_EXISTS')
    expect(PublicErrorCode.VALIDATION_FAILED).toBe('VALIDATION_FAILED')
  })

  it('PROTOCOL_CONSTANTS.version matches EXECUTION_PROTOCOL_VERSION', () => {
    expect(PROTOCOL_CONSTANTS.version).toBe(EXECUTION_PROTOCOL_VERSION)
  })

  it('PROTOCOL_CONSTANTS.schemaRoutePrefix is /v1/schemas', () => {
    expect(PROTOCOL_CONSTANTS.schemaRoutePrefix).toBe('/v1/schemas')
  })
})

describe('ValidationOutcome', () => {
  it('has exactly 4 outcomes', () => {
    expect(Object.values(ValidationOutcome)).toHaveLength(4)
  })

  it('VALID INVALID NOT_REQUESTED NOT_EVALUATED all defined', () => {
    expect(ValidationOutcome.VALID).toBe('VALID')
    expect(ValidationOutcome.INVALID).toBe('INVALID')
    expect(ValidationOutcome.NOT_REQUESTED).toBe('NOT_REQUESTED')
    expect(ValidationOutcome.NOT_EVALUATED).toBe('NOT_EVALUATED')
  })

  it('INVALID and NOT_EVALUATED are not VALID', () => {
    expect(ValidationOutcome.INVALID).not.toBe(ValidationOutcome.VALID)
    expect(ValidationOutcome.NOT_EVALUATED).not.toBe(ValidationOutcome.VALID)
  })
})

describe('JSON schemas', () => {
  it('exports 12 schemas (8 original + 4 Stage 16C registry)', () => {
    expect(ALL_SCHEMAS).toHaveLength(12)
  })

  it('all schemas have $id starting with https://rohinik.org/schemas/execution-protocol/v1/', () => {
    for (const s of ALL_SCHEMAS) {
      expect(s.$id).toMatch(/^https:\/\/rohinik\.org\/schemas\/execution-protocol\/v1\//)
    }
  })

  it('SubmitExecutionRequest requires content and contentType', () => {
    const schema = ALL_SCHEMAS.find(s => s.title === 'SubmitExecutionRequest')
    expect(schema?.required).toContain('content')
    expect(schema?.required).toContain('contentType')
  })

  it('SubmitExecutionRequest has optional outputSchemaRef property', () => {
    const schema = ALL_SCHEMAS.find(s => s.title === 'SubmitExecutionRequest')
    expect(schema?.properties).toHaveProperty('outputSchemaRef')
    expect(schema?.required).not.toContain('outputSchemaRef')
  })

  it('ExecutionResultResponse has optional contentType and validationResult', () => {
    const schema = ALL_SCHEMAS.find(s => s.title === 'ExecutionResultResponse')
    expect(schema?.properties).toHaveProperty('contentType')
    expect(schema?.properties).toHaveProperty('validationResult')
    expect(schema?.required).not.toContain('contentType')
    expect(schema?.required).not.toContain('validationResult')
  })

  it('RegisterSchemaRequest requires schemaId version schema', () => {
    const schema = ALL_SCHEMAS.find(s => s.title === 'RegisterSchemaRequest')
    expect(schema?.required).toContain('schemaId')
    expect(schema?.required).toContain('version')
    expect(schema?.required).toContain('schema')
  })

  it('SchemaRecord requires semanticHash', () => {
    const schema = ALL_SCHEMAS.find(s => s.title === 'SchemaRecord')
    expect(schema?.required).toContain('semanticHash')
  })

  it('ValidateAgainstSchemaResponse outcome enum matches ValidationOutcome values', () => {
    const schema = ALL_SCHEMAS.find(s => s.title === 'ValidateAgainstSchemaResponse')
    const props = (schema?.properties as unknown as Record<string, { enum?: readonly string[] }>)
    expect(props?.outcome?.enum).toEqual(expect.arrayContaining(['VALID', 'INVALID', 'NOT_REQUESTED', 'NOT_EVALUATED']))
  })
})
