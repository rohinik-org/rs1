import { describe, it, expect } from 'vitest'
import {
  intelligentExecutionId,
  executionEvidenceId,
  executionSessionId,
  traceId,
  spanId,
  invocationId,
  selectionId,
  retryId,
  fallbackId,
  validationId,
  contentHash,
  EvidenceCompletionState,
  EvidenceIntegrityStatus,
  EvidenceSchemaVersion,
  EvidenceErrorCode,
  EvidenceEventType,
  CANONICALIZATION_VERSION,
} from '../index.js'

// ── ID constructors ───────────────────────────────────────────────────────────

describe('ID constructors', () => {
  it('intelligentExecutionId rejects empty string', () => {
    expect(() => intelligentExecutionId('')).toThrow()
  })

  it('intelligentExecutionId accepts non-empty string', () => {
    const id = intelligentExecutionId('exec-1')
    expect(id).toBe('exec-1')
  })

  it('executionEvidenceId rejects empty string', () => {
    expect(() => executionEvidenceId('')).toThrow()
  })

  it('executionEvidenceId accepts non-empty string', () => {
    const id = executionEvidenceId('ev-1')
    expect(id).toBe('ev-1')
  })

  it('executionSessionId accepts non-empty string', () => {
    expect(executionSessionId('sess-1')).toBe('sess-1')
  })

  it('traceId accepts non-empty string', () => {
    expect(traceId('trace-1')).toBe('trace-1')
  })

  it('spanId accepts non-empty string', () => {
    expect(spanId('span-1')).toBe('span-1')
  })

  it('invocationId accepts non-empty string', () => {
    expect(invocationId('inv-1')).toBe('inv-1')
  })

  it('selectionId accepts non-empty string', () => {
    expect(selectionId('sel-1')).toBe('sel-1')
  })

  it('retryId accepts non-empty string', () => {
    expect(retryId('retry-1')).toBe('retry-1')
  })

  it('fallbackId accepts non-empty string', () => {
    expect(fallbackId('fb-1')).toBe('fb-1')
  })

  it('validationId accepts non-empty string', () => {
    expect(validationId('val-1')).toBe('val-1')
  })

  it('contentHash accepts non-empty string', () => {
    expect(contentHash('abc123')).toBe('abc123')
  })

  it('all ID constructors reject empty string', () => {
    const ctors = [
      executionSessionId, traceId, spanId, invocationId,
      selectionId, retryId, fallbackId, validationId, contentHash,
    ]
    for (const c of ctors) {
      expect(() => c('')).toThrow()
    }
  })
})

// ── EvidenceCompletionState ───────────────────────────────────────────────────

describe('EvidenceCompletionState', () => {
  it('has OPEN and SEALED values', () => {
    expect(EvidenceCompletionState.OPEN).toBeDefined()
    expect(EvidenceCompletionState.SEALED).toBeDefined()
  })

  it('OPEN and SEALED are distinct', () => {
    expect(EvidenceCompletionState.OPEN).not.toBe(EvidenceCompletionState.SEALED)
  })
})

// ── EvidenceIntegrityStatus ───────────────────────────────────────────────────

describe('EvidenceIntegrityStatus', () => {
  it('has VALID, INTEGRITY_FAILED, NOT_FOUND', () => {
    expect(EvidenceIntegrityStatus.VALID).toBeDefined()
    expect(EvidenceIntegrityStatus.INTEGRITY_FAILED).toBeDefined()
    expect(EvidenceIntegrityStatus.NOT_FOUND).toBeDefined()
  })
})

// ── Schema version and canonicalization version ───────────────────────────────

describe('Schema and canonicalization versions', () => {
  it('EvidenceSchemaVersion is a non-empty string', () => {
    expect(typeof EvidenceSchemaVersion).toBe('string')
    expect(EvidenceSchemaVersion.length).toBeGreaterThan(0)
  })

  it('CANONICALIZATION_VERSION is a non-empty string', () => {
    expect(typeof CANONICALIZATION_VERSION).toBe('string')
    expect(CANONICALIZATION_VERSION.length).toBeGreaterThan(0)
  })
})

// ── Error codes ───────────────────────────────────────────────────────────────

describe('EvidenceErrorCode', () => {
  it('has EVIDENCE_SEAL_FAILED', () => {
    expect(EvidenceErrorCode.EVIDENCE_SEAL_FAILED).toBeDefined()
  })

  it('has EVIDENCE_PERSISTENCE_FAILED', () => {
    expect(EvidenceErrorCode.EVIDENCE_PERSISTENCE_FAILED).toBeDefined()
  })

  it('has EVIDENCE_INTEGRITY_FAILED', () => {
    expect(EvidenceErrorCode.EVIDENCE_INTEGRITY_FAILED).toBeDefined()
  })

  it('has EVIDENCE_NOT_FOUND', () => {
    expect(EvidenceErrorCode.EVIDENCE_NOT_FOUND).toBeDefined()
  })

  it('has EVIDENCE_DUPLICATE_EVENT', () => {
    expect(EvidenceErrorCode.EVIDENCE_DUPLICATE_EVENT).toBeDefined()
  })

  it('has EVIDENCE_MISSING_REQUIRED_FIELD', () => {
    expect(EvidenceErrorCode.EVIDENCE_MISSING_REQUIRED_FIELD).toBeDefined()
  })

  it('has EVIDENCE_CONFLICTING_REWRITE', () => {
    expect(EvidenceErrorCode.EVIDENCE_CONFLICTING_REWRITE).toBeDefined()
  })
})

// ── Event types ───────────────────────────────────────────────────────────────

describe('EvidenceEventType', () => {
  const required = [
    'EVIDENCE_OPENED',
    'EVIDENCE_OBSERVATION_APPENDED',
    'EVIDENCE_SEAL_STARTED',
    'EVIDENCE_SEALED',
    'EVIDENCE_REPOSITORY_ACCEPTED',
    'EVIDENCE_INTEGRITY_VERIFICATION_FAILED',
    'EVIDENCE_REDACTED_VIEW_PRODUCED',
    'EVIDENCE_PERSISTENCE_FAILED',
  ]

  for (const name of required) {
    it(`has ${name}`, () => {
      expect((EvidenceEventType as Record<string, string>)[name]).toBeDefined()
    })
  }
})

// ── Interface shapes (compile-time, verified by typecheck) ───────────────────
// These tests verify runtime presence of expected export names.

describe('Interface exports', () => {
  it('module exports are defined (smoke)', async () => {
    const mod = await import('../index.js')
    // Service and repository are interfaces — no runtime value; verified via typecheck only.
    // Opaque reference constructors:
    expect(mod.makeContextAdmissionRef).toBeDefined()
    expect(mod.makeCapabilityBindingRef).toBeDefined()
    expect(mod.makeRoutingDecisionRef).toBeDefined()
    expect(mod.makePolicyDecisionRef).toBeDefined()
    expect(mod.makeEvaluationRef).toBeDefined()
    expect(mod.makeActivationRef).toBeDefined()
  })
})
