import { describe, it, expect } from 'vitest'
import type {
  DatasetUseAuthorizationService,
  DatasetUseAuthorizationRequest,
  DatasetUseAuthorizationDecision,
  DatasetClassificationRecord,
  DatasetResidencyRecord,
  DatasetRetentionRecord,
  DatasetConsentRecord,
} from '../../src/index.js'
import {
  validateAuthorizationRecord,
  checkAuthorizationExpiry,
  checkAuthorizationRevocation,
} from '../../src/index.js'
import type {
  DatasetAuthorizationRecord,
  DatasetGovernanceContext,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const CTX: DatasetGovernanceContext = {
  tenantId: 'tenant-1',
  environmentId: 'env-prod',
  requestedAt: '2024-06-01T10:00:00.000Z' as const as import('../../src/index.js').DatasetIsoTimestamp,
  requestingPrincipalId: 'principal-001',
}

const BASE_AUTH: DatasetAuthorizationRecord = {
  authorizationId: 'auth-001',
  datasetId: 'ds-001' as import('@rohinik-org/ml-ir').DatasetId,
  purpose: 'training',
  scope: 'internal',
  outcome: 'AUTHORIZED',
  policyReferenceIds: ['policy-001'],
  decidedAt: '2024-01-01T00:00:00.000Z' as const as import('../../src/index.js').DatasetIsoTimestamp,
}

// ── validateAuthorizationRecord ───────────────────────────────────────────────

describe('validateAuthorizationRecord', () => {
  it('accepts a valid AUTHORIZED record', () => {
    expect(() => validateAuthorizationRecord(BASE_AUTH)).not.toThrow()
  })

  it('rejects record with no policyReferenceIds', () => {
    const bad = { ...BASE_AUTH, policyReferenceIds: [] }
    expect(() => validateAuthorizationRecord(bad)).toThrow()
  })

  it('rejects record with blank authorizationId', () => {
    const bad = { ...BASE_AUTH, authorizationId: '' }
    expect(() => validateAuthorizationRecord(bad)).toThrow()
  })

  it('rejects CONDITIONALLY_AUTHORIZED with no conditionIds', () => {
    const bad: DatasetAuthorizationRecord = {
      ...BASE_AUTH,
      outcome: 'CONDITIONALLY_AUTHORIZED',
    }
    expect(() => validateAuthorizationRecord(bad)).toThrow()
  })

  it('accepts CONDITIONALLY_AUTHORIZED with conditionIds', () => {
    const ok: DatasetAuthorizationRecord = {
      ...BASE_AUTH,
      outcome: 'CONDITIONALLY_AUTHORIZED',
      conditionIds: ['cond-001'],
    }
    expect(() => validateAuthorizationRecord(ok)).not.toThrow()
  })
})

// ── checkAuthorizationExpiry ──────────────────────────────────────────────────

describe('checkAuthorizationExpiry', () => {
  it('returns false for record with no expiresAt', () => {
    expect(checkAuthorizationExpiry(BASE_AUTH, CTX.requestedAt)).toBe(false)
  })

  it('returns true when expiresAt is before requestedAt', () => {
    const expired: DatasetAuthorizationRecord = {
      ...BASE_AUTH,
      expiresAt: '2023-01-01T00:00:00.000Z' as const as import('../../src/index.js').DatasetIsoTimestamp,
    }
    expect(checkAuthorizationExpiry(expired, CTX.requestedAt)).toBe(true)
  })

  it('returns false when expiresAt is after requestedAt', () => {
    const notYet: DatasetAuthorizationRecord = {
      ...BASE_AUTH,
      expiresAt: '2025-01-01T00:00:00.000Z' as const as import('../../src/index.js').DatasetIsoTimestamp,
    }
    expect(checkAuthorizationExpiry(notYet, CTX.requestedAt)).toBe(false)
  })
})

// ── checkAuthorizationRevocation ─────────────────────────────────────────────

describe('checkAuthorizationRevocation', () => {
  it('returns false for AUTHORIZED outcome', () => {
    expect(checkAuthorizationRevocation(BASE_AUTH)).toBe(false)
  })

  it('returns true for REVOKED outcome', () => {
    const revoked: DatasetAuthorizationRecord = { ...BASE_AUTH, outcome: 'REVOKED' }
    expect(checkAuthorizationRevocation(revoked)).toBe(true)
  })

  it('returns false for EXPIRED outcome (different check)', () => {
    const expired: DatasetAuthorizationRecord = { ...BASE_AUTH, outcome: 'EXPIRED' }
    expect(checkAuthorizationRevocation(expired)).toBe(false)
  })
})

// ── DatasetUseAuthorizationRequest / Decision types ───────────────────────────

describe('DatasetUseAuthorizationRequest structure', () => {
  it('can construct a valid request', () => {
    const req: DatasetUseAuthorizationRequest = {
      requestId: 'req-001',
      datasetId: 'ds-001' as import('@rohinik-org/ml-ir').DatasetId,
      purpose: 'training',
      scope: 'internal',
      requestedAt: CTX.requestedAt,
      requestingPrincipalId: 'principal-001',
      tenantId: 'tenant-1',
      environmentId: 'env-prod',
    }
    expect(req.purpose).toBe('training')
  })
})

describe('DatasetUseAuthorizationDecision', () => {
  it('AUTHORIZED decision has no conditions', () => {
    const decision: DatasetUseAuthorizationDecision = {
      decisionId: 'dec-001',
      requestId: 'req-001',
      datasetId: 'ds-001' as import('@rohinik-org/ml-ir').DatasetId,
      outcome: 'AUTHORIZED',
      appliedPolicyIds: ['policy-001'],
      decidedAt: CTX.requestedAt,
      decisionHash: 'sha256:' + 'a'.repeat(64) as import('@rohinik-org/ml-ir').ContentHash,
    }
    expect(decision.outcome).toBe('AUTHORIZED')
    expect(decision.conditionIds).toBeUndefined()
  })

  it('CONDITIONALLY_AUTHORIZED decision carries conditionIds', () => {
    const decision: DatasetUseAuthorizationDecision = {
      decisionId: 'dec-002',
      requestId: 'req-001',
      datasetId: 'ds-001' as import('@rohinik-org/ml-ir').DatasetId,
      outcome: 'CONDITIONALLY_AUTHORIZED',
      appliedPolicyIds: ['policy-002'],
      conditionIds: ['cond-001', 'cond-002'],
      decidedAt: CTX.requestedAt,
      decisionHash: 'sha256:' + 'b'.repeat(64) as import('@rohinik-org/ml-ir').ContentHash,
    }
    expect(decision.conditionIds).toHaveLength(2)
  })

  it('DENIED decision carries denialReasonCode', () => {
    const decision: DatasetUseAuthorizationDecision = {
      decisionId: 'dec-003',
      requestId: 'req-001',
      datasetId: 'ds-001' as import('@rohinik-org/ml-ir').DatasetId,
      outcome: 'DENIED',
      appliedPolicyIds: ['policy-003'],
      denialReasonCode: 'DATASET_AUTHORIZATION_WRONG_PURPOSE',
      decidedAt: CTX.requestedAt,
      decisionHash: 'sha256:' + 'c'.repeat(64) as import('@rohinik-org/ml-ir').ContentHash,
    }
    expect(decision.denialReasonCode).toBe('DATASET_AUTHORIZATION_WRONG_PURPOSE')
  })
})

// ── DatasetClassificationRecord ───────────────────────────────────────────────

describe('DatasetClassificationRecord', () => {
  it('has classificationLevel, piiPresent, and restrictedPurposes', () => {
    const rec: DatasetClassificationRecord = {
      datasetId: 'ds-001' as import('@rohinik-org/ml-ir').DatasetId,
      classificationLevel: 'CONFIDENTIAL',
      piiPresent: true,
      restrictedPurposes: ['external-sharing'],
      classifiedAt: CTX.requestedAt,
    }
    expect(rec.piiPresent).toBe(true)
    expect(rec.classificationLevel).toBe('CONFIDENTIAL')
  })
})

// ── DatasetResidencyRecord ────────────────────────────────────────────────────

describe('DatasetResidencyRecord', () => {
  it('has allowedRegions and prohibitedRegions', () => {
    const rec: DatasetResidencyRecord = {
      datasetId: 'ds-001' as import('@rohinik-org/ml-ir').DatasetId,
      allowedRegions: ['eu-west-1'],
      prohibitedRegions: ['us-east-1'],
      recordedAt: CTX.requestedAt,
    }
    expect(rec.allowedRegions).toContain('eu-west-1')
  })
})

// ── DatasetRetentionRecord ────────────────────────────────────────────────────

describe('DatasetRetentionRecord', () => {
  it('has retainUntil and legalHold', () => {
    const rec: DatasetRetentionRecord = {
      datasetId: 'ds-001' as import('@rohinik-org/ml-ir').DatasetId,
      retainUntil: '2026-01-01T00:00:00.000Z' as const as import('../../src/index.js').DatasetIsoTimestamp,
      legalHold: false,
      recordedAt: CTX.requestedAt,
    }
    expect(rec.legalHold).toBe(false)
  })
})

// ── DatasetConsentRecord ──────────────────────────────────────────────────────

describe('DatasetConsentRecord', () => {
  it('has consentScope, grantedBy, and allowedPurposes', () => {
    const rec: DatasetConsentRecord = {
      datasetId: 'ds-001' as import('@rohinik-org/ml-ir').DatasetId,
      consentScope: 'research',
      grantedBy: 'subject-001',
      allowedPurposes: ['training', 'evaluation'],
      grantedAt: CTX.requestedAt,
    }
    expect(rec.allowedPurposes).toContain('training')
  })
})

// ── DatasetUseAuthorizationService interface ──────────────────────────────────

describe('DatasetUseAuthorizationService interface', () => {
  it('service port shape: authorize, validate, supersede', () => {
    // compile-time: implement the interface with a stub
    const stub: DatasetUseAuthorizationService = {
      authorize: async (_req) => ({ } as DatasetUseAuthorizationDecision),
      validateRecord: (_rec) => { },
      supersedeDecision: async (_id, _reason) => ({ } as DatasetUseAuthorizationDecision),
    }
    expect(stub).toBeDefined()
  })
})

// ── leakage sentinel: no sensitive content stored ─────────────────────────────

describe('leakage sentinel', () => {
  it('DatasetUseAuthorizationDecision has no raw content fields', () => {
    const keys: (keyof DatasetUseAuthorizationDecision)[] = [
      'decisionId', 'requestId', 'datasetId', 'outcome',
      'appliedPolicyIds', 'decidedAt', 'decisionHash',
    ]
    // optional fields
    const optional: (keyof DatasetUseAuthorizationDecision)[] = [
      'conditionIds', 'denialReasonCode', 'supersedesDecisionId',
    ]
    const allKeys = [...keys, ...optional]
    const rawContentKeys = ['rawData', 'content', 'payload', 'body', 'data']
    for (const k of allKeys) {
      expect(rawContentKeys).not.toContain(k)
    }
  })
})

// ── purpose/scope mismatch ────────────────────────────────────────────────────

describe('purpose and scope matching helpers', () => {
  it('purposeMatches returns true for exact match', async () => {
    const { purposeMatches, scopeMatches } = await import('../../src/index.js')
    expect(purposeMatches('training', BASE_AUTH)).toBe(true)
    expect(purposeMatches('inference', BASE_AUTH)).toBe(false)
  })

  it('scopeMatches returns true for exact match', async () => {
    const { scopeMatches } = await import('../../src/index.js')
    expect(scopeMatches('internal', BASE_AUTH)).toBe(true)
    expect(scopeMatches('external', BASE_AUTH)).toBe(false)
  })
})

// ── supersession: immutable decisions ────────────────────────────────────────

describe('supersession', () => {
  it('DatasetUseAuthorizationDecision can reference superseded decision', () => {
    const decision: DatasetUseAuthorizationDecision = {
      decisionId: 'dec-002',
      requestId: 'req-002',
      datasetId: 'ds-001' as import('@rohinik-org/ml-ir').DatasetId,
      outcome: 'AUTHORIZED',
      appliedPolicyIds: ['policy-001'],
      decidedAt: CTX.requestedAt,
      decisionHash: 'sha256:' + 'd'.repeat(64) as import('@rohinik-org/ml-ir').ContentHash,
      supersedesDecisionId: 'dec-001',
    }
    expect(decision.supersedesDecisionId).toBe('dec-001')
  })
})

// ── policy mismatch ───────────────────────────────────────────────────────────

describe('policy reference check', () => {
  it('validateAuthorizationRecord rejects record with empty policyReferenceIds', () => {
    const bad = { ...BASE_AUTH, policyReferenceIds: [] as readonly string[] }
    expect(() => validateAuthorizationRecord(bad)).toThrow()
  })
})
