import { describe, it, expect } from 'vitest'
import type { ModelId, DeploymentId, IsoTimestamp, ContentHash, RetirementRecordId } from '@rohinik-org/ml-ir'
import {
  buildRetirementRequest,
  assessRetirementImpact,
  buildRetirementDecision,
  buildModelSupersession,
  type RetirementRequest,
  type RetirementImpactAssessment,
  type RetirementDecision,
} from '../../src/index.js'

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const HASH2 = `sha256:${'b'.repeat(64)}` as ContentHash
const MOD  = 'model-1' as ModelId
const DEP  = 'dep-1' as DeploymentId
const RET  = 'ret-1' as RetirementRecordId

// ── buildRetirementRequest ────────────────────────────────────────────────────

describe('buildRetirementRequest', () => {
  it('valid request has requestHash', () => {
    const r = buildRetirementRequest({
      requestId: 'req-1', modelId: MOD, requestedBy: 'principal-1',
      requestedAt: NOW, rationale: 'superseded by v2',
      evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
    })
    expect(r.requestId).toBe('req-1')
    expect(r.requestHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('requestHash is deterministic', () => {
    const input = {
      requestId: 'req-1', modelId: MOD, requestedBy: 'p',
      requestedAt: NOW, rationale: 'done',
      evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
    }
    expect(buildRetirementRequest(input).requestHash).toBe(buildRetirementRequest(input).requestHash)
  })

  it('empty requestedBy throws OPERATIONS_RETIREMENT_ACTIVE_DEPLOYMENT', () => {
    expect(() => buildRetirementRequest({
      requestId: 'req-1', modelId: MOD, requestedBy: '',
      requestedAt: NOW, rationale: 'done',
      evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
    })).toThrow('OPERATIONS_RETIREMENT_ACTIVE_DEPLOYMENT')
  })

  it('missing evidenceRef throws OPERATIONS_MISSING_EVIDENCE', () => {
    expect(() => buildRetirementRequest({
      requestId: 'req-1', modelId: MOD, requestedBy: 'p',
      requestedAt: NOW, rationale: 'done',
      evidenceRef: undefined as any,
    })).toThrow('OPERATIONS_MISSING_EVIDENCE')
  })
})

// ── assessRetirementImpact ────────────────────────────────────────────────────

describe('assessRetirementImpact', () => {
  it('no active deployments → eligible', () => {
    const result = assessRetirementImpact({ modelId: MOD, activeDeploymentIds: [], activeConsumerCount: 0 })
    expect(result.eligible).toBe(true)
    expect(result.blockers).toHaveLength(0)
  })

  it('active deployment → not eligible, blocker listed', () => {
    const result = assessRetirementImpact({ modelId: MOD, activeDeploymentIds: [DEP], activeConsumerCount: 0 })
    expect(result.eligible).toBe(false)
    expect(result.blockers.some(b => b.kind === 'ACTIVE_DEPLOYMENT')).toBe(true)
  })

  it('active consumers → not eligible', () => {
    const result = assessRetirementImpact({ modelId: MOD, activeDeploymentIds: [], activeConsumerCount: 3 })
    expect(result.eligible).toBe(false)
    expect(result.blockers.some(b => b.kind === 'ACTIVE_CONSUMER')).toBe(true)
  })

  it('legal hold → not eligible', () => {
    const result = assessRetirementImpact({ modelId: MOD, activeDeploymentIds: [], activeConsumerCount: 0, legalHold: true })
    expect(result.eligible).toBe(false)
    expect(result.blockers.some(b => b.kind === 'LEGAL_HOLD')).toBe(true)
  })
})

// ── buildRetirementDecision ───────────────────────────────────────────────────

describe('buildRetirementDecision', () => {
  it('eligible impact → APPROVED decision with decisionHash', () => {
    const impact = assessRetirementImpact({ modelId: MOD, activeDeploymentIds: [], activeConsumerCount: 0 })
    const d = buildRetirementDecision({
      decisionId: RET, modelId: MOD, impact, decidedBy: 'principal-1',
      decidedAt: NOW, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
    })
    expect(d.outcome).toBe('APPROVED')
    expect(d.decisionHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('ineligible impact → BLOCKED decision', () => {
    const impact = assessRetirementImpact({ modelId: MOD, activeDeploymentIds: [DEP], activeConsumerCount: 0 })
    const d = buildRetirementDecision({
      decisionId: RET, modelId: MOD, impact, decidedBy: 'p',
      decidedAt: NOW, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
    })
    expect(d.outcome).toBe('BLOCKED')
  })

  it('decision has no directUndeploy or terminateDeployment method', () => {
    const impact = assessRetirementImpact({ modelId: MOD, activeDeploymentIds: [], activeConsumerCount: 0 })
    const d = buildRetirementDecision({
      decisionId: RET, modelId: MOD, impact, decidedBy: 'p',
      decidedAt: NOW, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
    })
    expect('directUndeploy' in d).toBe(false)
    expect('terminateDeployment' in d).toBe(false)
  })

  it('decisionHash is deterministic', () => {
    const impact = assessRetirementImpact({ modelId: MOD, activeDeploymentIds: [], activeConsumerCount: 0 })
    const input = {
      decisionId: RET, modelId: MOD, impact, decidedBy: 'p',
      decidedAt: NOW, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
    }
    expect(buildRetirementDecision(input).decisionHash).toBe(buildRetirementDecision(input).decisionHash)
  })

  it('missing evidenceRef throws OPERATIONS_MISSING_EVIDENCE', () => {
    const impact = assessRetirementImpact({ modelId: MOD, activeDeploymentIds: [], activeConsumerCount: 0 })
    expect(() => buildRetirementDecision({
      decisionId: RET, modelId: MOD, impact, decidedBy: 'p',
      decidedAt: NOW, evidenceRef: undefined as any,
    })).toThrow('OPERATIONS_MISSING_EVIDENCE')
  })
})

// ── buildModelSupersession ────────────────────────────────────────────────────

describe('buildModelSupersession', () => {
  it('valid supersession has supersessionHash', () => {
    const s = buildModelSupersession({
      supersededModelId: MOD,
      supersededByModelId: 'model-2' as ModelId,
      supersededAt: NOW, reason: 'new version', supersededBy: 'p',
      evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
    })
    expect(s.supersededModelId).toBe(MOD)
    expect(s.supersessionHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('supersessionHash is deterministic', () => {
    const input = {
      supersededModelId: MOD, supersededByModelId: 'model-2' as ModelId,
      supersededAt: NOW, reason: 'v2', supersededBy: 'p',
      evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
    }
    expect(buildModelSupersession(input).supersessionHash).toBe(buildModelSupersession(input).supersessionHash)
  })

  it('self-supersession throws OPERATIONS_SUPERSESSION_CONFLICT', () => {
    expect(() => buildModelSupersession({
      supersededModelId: MOD, supersededByModelId: MOD,
      supersededAt: NOW, reason: 'x', supersededBy: 'p',
      evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
    })).toThrow('OPERATIONS_SUPERSESSION_CONFLICT')
  })
})
