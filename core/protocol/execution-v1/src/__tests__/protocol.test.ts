import { describe, it, expect } from 'vitest'
import {
  EXECUTION_PROTOCOL_VERSION,
  PublicExecutionState,
  PUBLIC_TERMINAL_STATES,
  PublicErrorCode,
  PROTOCOL_CONSTANTS,
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

  it('all error codes defined', () => {
    expect(PublicErrorCode.EXECUTION_NOT_FOUND).toBe('EXECUTION_NOT_FOUND')
    expect(PublicErrorCode.RESULT_NOT_READY).toBe('RESULT_NOT_READY')
    expect(PublicErrorCode.IDEMPOTENCY_CONFLICT).toBe('IDEMPOTENCY_CONFLICT')
    expect(PublicErrorCode.PROTOCOL_VERSION_MISMATCH).toBe('PROTOCOL_VERSION_MISMATCH')
  })

  it('PROTOCOL_CONSTANTS.version matches EXECUTION_PROTOCOL_VERSION', () => {
    expect(PROTOCOL_CONSTANTS.version).toBe(EXECUTION_PROTOCOL_VERSION)
  })
})

describe('JSON schemas', () => {
  it('exports 8 schemas', () => {
    expect(ALL_SCHEMAS).toHaveLength(8)
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
})
