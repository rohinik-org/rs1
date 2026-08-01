import { describe, it, expect } from 'vitest'
import type { ContentHash, IsoTimestamp, DeploymentId, EndpointId, InferenceRequestId } from '@rohinik-org/ml-ir'
import {
  buildInferenceRequest,
  type InferenceRequestInput,
  type ValidatedInferenceRequest,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const DEP  = 'dep-1' as DeploymentId
const EP   = 'ep-1' as EndpointId

function makeInput(overrides?: Partial<InferenceRequestInput>): InferenceRequestInput {
  return {
    inferenceRequestId: 'inf-1' as InferenceRequestId,
    endpointId: EP,
    deploymentId: DEP,
    revisionId: 'rev-1',
    modelVersionId: 'model-v1',
    inputHash: HASH,
    endpointState: 'READY',
    requestedAt: NOW,
    requestedBy: 'principal-1',
    ...overrides,
  }
}

// ── valid request ─────────────────────────────────────────────────────────────

describe('buildInferenceRequest: valid', () => {
  it('valid input returns request with canonical requestHash', () => {
    const r = buildInferenceRequest(makeInput())
    expect(r.inferenceRequestId).toBe('inf-1')
    expect(r.requestHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('requestHash is deterministic', () => {
    const input = makeInput()
    const r1 = buildInferenceRequest(input)
    const r2 = buildInferenceRequest(input)
    expect(r1.requestHash).toBe(r2.requestHash)
  })

  it('different inputHash produces different requestHash', () => {
    const HASH2 = `sha256:${'b'.repeat(64)}` as ContentHash
    const r1 = buildInferenceRequest(makeInput())
    const r2 = buildInferenceRequest(makeInput({ inputHash: HASH2 }))
    expect(r1.requestHash).not.toBe(r2.requestHash)
  })

  it('request has no rawInput field — sensitive input not persisted', () => {
    const r = buildInferenceRequest(makeInput())
    expect('rawInput' in r).toBe(false)
    expect('payload' in r).toBe(false)
  })
})

// ── endpoint readiness ────────────────────────────────────────────────────────

describe('buildInferenceRequest: endpoint readiness', () => {
  it('READY endpoint passes', () => {
    expect(() => buildInferenceRequest(makeInput({ endpointState: 'READY' }))).not.toThrow()
  })

  it('DEGRADED endpoint throws DEPLOYMENT_ENDPOINT_NOT_READY', () => {
    expect(() => buildInferenceRequest(makeInput({ endpointState: 'DEGRADED' }))).toThrow('DEPLOYMENT_ENDPOINT_NOT_READY')
  })

  it('STARTING endpoint throws DEPLOYMENT_ENDPOINT_NOT_READY', () => {
    expect(() => buildInferenceRequest(makeInput({ endpointState: 'STARTING' }))).toThrow('DEPLOYMENT_ENDPOINT_NOT_READY')
  })

  it('STOPPED endpoint throws DEPLOYMENT_ENDPOINT_NOT_READY', () => {
    expect(() => buildInferenceRequest(makeInput({ endpointState: 'STOPPED' }))).toThrow('DEPLOYMENT_ENDPOINT_NOT_READY')
  })

  it('FAILED endpoint throws DEPLOYMENT_ENDPOINT_NOT_READY', () => {
    expect(() => buildInferenceRequest(makeInput({ endpointState: 'FAILED' }))).toThrow('DEPLOYMENT_ENDPOINT_NOT_READY')
  })
})

// ── identity checks ───────────────────────────────────────────────────────────

describe('buildInferenceRequest: identity', () => {
  it('empty inferenceRequestId throws DEPLOYMENT_INVALID_IDENTITY', () => {
    expect(() => buildInferenceRequest(makeInput({ inferenceRequestId: '' as InferenceRequestId }))).toThrow('DEPLOYMENT_INVALID_IDENTITY')
  })

  it('invalid inputHash format throws DEPLOYMENT_INVALID_IDENTITY', () => {
    expect(() => buildInferenceRequest(makeInput({ inputHash: 'bad-hash' as ContentHash }))).toThrow('DEPLOYMENT_INVALID_IDENTITY')
  })

  it('empty revisionId throws DEPLOYMENT_REQUEST_IDENTITY_MISMATCH', () => {
    expect(() => buildInferenceRequest(makeInput({ revisionId: '' }))).toThrow('DEPLOYMENT_REQUEST_IDENTITY_MISMATCH')
  })

  it('empty modelVersionId throws DEPLOYMENT_REQUEST_IDENTITY_MISMATCH', () => {
    expect(() => buildInferenceRequest(makeInput({ modelVersionId: '' }))).toThrow('DEPLOYMENT_REQUEST_IDENTITY_MISMATCH')
  })
})

// ── idempotency ───────────────────────────────────────────────────────────────

describe('buildInferenceRequest: idempotency', () => {
  it('same idempotencyKey with same hash is idempotent', () => {
    const store = new Map<string, ValidatedInferenceRequest>()
    const input = makeInput({ idempotencyKey: 'idem-1' })
    const r1 = buildInferenceRequest(input, store)
    const r2 = buildInferenceRequest(input, store)
    expect(r1.requestHash).toBe(r2.requestHash)
    expect(store.size).toBe(1)
  })

  it('same idempotencyKey with different inputHash throws DEPLOYMENT_IDEMPOTENCY_CONFLICT', () => {
    const store = new Map<string, ValidatedInferenceRequest>()
    const HASH2 = `sha256:${'b'.repeat(64)}` as ContentHash
    buildInferenceRequest(makeInput({ idempotencyKey: 'idem-1' }), store)
    expect(() => buildInferenceRequest(makeInput({ idempotencyKey: 'idem-1', inputHash: HASH2 }), store)).toThrow('DEPLOYMENT_IDEMPOTENCY_CONFLICT')
  })
})
