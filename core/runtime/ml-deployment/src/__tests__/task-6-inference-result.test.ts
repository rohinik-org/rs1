import { describe, it, expect } from 'vitest'
import type { ContentHash, IsoTimestamp, InferenceRequestId } from '@rohinik-org/ml-ir'
import {
  buildInferenceResult,
  type InferenceResultInput,
  type InferenceResult,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOW   = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH  = `sha256:${'a'.repeat(64)}` as ContentHash
const HASH2 = `sha256:${'b'.repeat(64)}` as ContentHash
const REQ   = 'inf-1' as InferenceRequestId

// ponytail: LoosePartial lets callers pass undefined to delete optional keys,
// bypassing exactOptionalPropertyTypes which rejects Partial<T> with explicit undefined
type LoosePartial<T> = { [K in keyof T]?: T[K] | undefined }

function makeInput(overrides?: LoosePartial<InferenceResultInput>): InferenceResultInput {
  const base: InferenceResultInput = {
    inferenceRequestId: REQ,
    requestHash:        HASH,
    outcome:            'SUCCESS',
    outputHash:         HASH,
    latencyMs:          42,
    evidenceRef:        { evidenceId: 'ev-1', evidenceHash: HASH },
    recordedAt:         NOW,
    recordedBy:         'principal-1',
  }
  if (overrides) {
    for (const key of Object.keys(overrides) as (keyof InferenceResultInput)[]) {
      if (overrides[key] === undefined) delete (base as unknown as Record<string, unknown>)[key]
    }
    Object.assign(base, Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)))
  }
  return base
}

// ── outcomes ──────────────────────────────────────────────────────────────────

describe('buildInferenceResult: outcomes', () => {
  it('SUCCESS produces result with resultHash', () => {
    const r = buildInferenceResult(makeInput())
    expect(r.outcome).toBe('SUCCESS')
    expect(r.resultHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('ERROR produces result with errorCode', () => {
    const r = buildInferenceResult(makeInput({ outcome: 'ERROR', errorCode: 'MODEL_ERROR' }))
    expect(r.outcome).toBe('ERROR')
    expect(r.errorCode).toBe('MODEL_ERROR')
  })

  it('TIMEOUT produces result', () => {
    const r = buildInferenceResult(makeInput({ outcome: 'TIMEOUT', outputHash: undefined }))
    expect(r.outcome).toBe('TIMEOUT')
  })

  it('CANCELLED produces result', () => {
    const r = buildInferenceResult(makeInput({ outcome: 'CANCELLED', outputHash: undefined }))
    expect(r.outcome).toBe('CANCELLED')
  })
})

// ── determinism ───────────────────────────────────────────────────────────────

describe('buildInferenceResult: determinism', () => {
  it('resultHash is deterministic', () => {
    const input = makeInput()
    expect(buildInferenceResult(input).resultHash).toBe(buildInferenceResult(input).resultHash)
  })

  it('different requestHash produces different resultHash', () => {
    const r1 = buildInferenceResult(makeInput())
    const r2 = buildInferenceResult(makeInput({ requestHash: HASH2 }))
    expect(r1.resultHash).not.toBe(r2.resultHash)
  })
})

// ── evidence required ─────────────────────────────────────────────────────────

describe('buildInferenceResult: evidence', () => {
  it('missing evidenceRef throws DEPLOYMENT_INFERENCE_MISSING_EVIDENCE', () => {
    expect(() => buildInferenceResult(makeInput({ evidenceRef: undefined }))).toThrow('DEPLOYMENT_INFERENCE_MISSING_EVIDENCE')
  })

  it('result carries evidenceRef', () => {
    const r = buildInferenceResult(makeInput())
    expect(r.evidenceRef.evidenceId).toBe('ev-1')
  })
})

// ── identity validation ───────────────────────────────────────────────────────

describe('buildInferenceResult: identity', () => {
  it('empty inferenceRequestId throws DEPLOYMENT_INVALID_IDENTITY', () => {
    expect(() => buildInferenceResult(makeInput({ inferenceRequestId: '' as InferenceRequestId }))).toThrow('DEPLOYMENT_INVALID_IDENTITY')
  })

  it('invalid requestHash format throws DEPLOYMENT_INVALID_IDENTITY', () => {
    expect(() => buildInferenceResult(makeInput({ requestHash: 'bad' as ContentHash }))).toThrow('DEPLOYMENT_INVALID_IDENTITY')
  })
})

// ── usage observations ────────────────────────────────────────────────────────

describe('buildInferenceResult: usage', () => {
  it('accepts valid usage', () => {
    const r = buildInferenceResult(makeInput({ usage: { inputTokens: 10, outputTokens: 20, computeMs: 40 } }))
    expect(r.usage?.inputTokens).toBe(10)
  })

  it('non-finite inputTokens throws DEPLOYMENT_PROVIDER_VIOLATION', () => {
    expect(() => buildInferenceResult(makeInput({ usage: { inputTokens: NaN, outputTokens: 0, computeMs: 0 } }))).toThrow('DEPLOYMENT_PROVIDER_VIOLATION')
  })

  it('negative outputTokens throws DEPLOYMENT_PROVIDER_VIOLATION', () => {
    expect(() => buildInferenceResult(makeInput({ usage: { inputTokens: 10, outputTokens: -1, computeMs: 0 } }))).toThrow('DEPLOYMENT_PROVIDER_VIOLATION')
  })

  it('Infinity computeMs throws DEPLOYMENT_PROVIDER_VIOLATION', () => {
    expect(() => buildInferenceResult(makeInput({ usage: { inputTokens: 0, outputTokens: 0, computeMs: Infinity } }))).toThrow('DEPLOYMENT_PROVIDER_VIOLATION')
  })
})

// ── no raw output ─────────────────────────────────────────────────────────────

describe('buildInferenceResult: no raw output', () => {
  it('result has no rawOutput or payload fields', () => {
    const r = buildInferenceResult(makeInput())
    expect('rawOutput' in r).toBe(false)
    expect('payload' in r).toBe(false)
  })
})

// ── idempotency ───────────────────────────────────────────────────────────────

describe('buildInferenceResult: idempotency', () => {
  it('same requestId twice is idempotent', () => {
    const store = new Map<string, InferenceResult>()
    const input = makeInput()
    const r1 = buildInferenceResult(input, store)
    const r2 = buildInferenceResult(input, store)
    expect(r1.resultHash).toBe(r2.resultHash)
    expect(store.size).toBe(1)
  })

  it('same requestId different outcome throws DEPLOYMENT_EVIDENCE_FAILURE', () => {
    const store = new Map<string, InferenceResult>()
    buildInferenceResult(makeInput(), store)
    expect(() => buildInferenceResult(makeInput({ outcome: 'ERROR', errorCode: 'X' }), store)).toThrow('DEPLOYMENT_EVIDENCE_FAILURE')
  })
})
