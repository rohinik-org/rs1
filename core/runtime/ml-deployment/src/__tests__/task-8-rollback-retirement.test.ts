import { describe, it, expect } from 'vitest'
import type { ContentHash, IsoTimestamp, DeploymentId, RollbackDirectiveId, RetirementRecordId } from '@rohinik-org/ml-ir'
import {
  buildRollbackDirective,
  executeRollback,
  buildRetirementRecord,
  type RollbackDirective,
  type RollbackResult,
  type RetirementRecord,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const DEP  = 'dep-1' as DeploymentId
const RBD  = 'rbd-1' as RollbackDirectiveId
const RET  = 'ret-1' as RetirementRecordId

// ── rollback directive ────────────────────────────────────────────────────────

describe('buildRollbackDirective', () => {
  it('valid directive is built with directiveHash', () => {
    const d = buildRollbackDirective({ directiveId: RBD, deploymentId: DEP, currentRevisionId: 'rev-2', targetRevisionId: 'rev-1', authorizedBy: 'principal-1', authorizedAt: NOW })
    expect(d.directiveId).toBe(RBD)
    expect(d.directiveHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('directiveHash is deterministic', () => {
    const input = { directiveId: RBD, deploymentId: DEP, currentRevisionId: 'rev-2', targetRevisionId: 'rev-1', authorizedBy: 'principal-1', authorizedAt: NOW }
    expect(buildRollbackDirective(input).directiveHash).toBe(buildRollbackDirective(input).directiveHash)
  })

  it('empty authorizedBy throws DEPLOYMENT_ROLLBACK_MISSING_AUTHORIZATION', () => {
    expect(() => buildRollbackDirective({ directiveId: RBD, deploymentId: DEP, currentRevisionId: 'rev-2', targetRevisionId: 'rev-1', authorizedBy: '', authorizedAt: NOW }))
      .toThrow('DEPLOYMENT_ROLLBACK_MISSING_AUTHORIZATION')
  })

  it('same currentRevisionId as targetRevisionId throws DEPLOYMENT_ROLLBACK_SAME_REVISION', () => {
    expect(() => buildRollbackDirective({ directiveId: RBD, deploymentId: DEP, currentRevisionId: 'rev-1', targetRevisionId: 'rev-1', authorizedBy: 'p', authorizedAt: NOW }))
      .toThrow('DEPLOYMENT_ROLLBACK_SAME_REVISION')
  })

  it('empty targetRevisionId throws DEPLOYMENT_ROLLBACK_UNKNOWN_TARGET', () => {
    expect(() => buildRollbackDirective({ directiveId: RBD, deploymentId: DEP, currentRevisionId: 'rev-2', targetRevisionId: '', authorizedBy: 'p', authorizedAt: NOW }))
      .toThrow('DEPLOYMENT_ROLLBACK_UNKNOWN_TARGET')
  })
})

// ── rollback execution ────────────────────────────────────────────────────────

describe('executeRollback', () => {
  function makeDirective() {
    return buildRollbackDirective({ directiveId: RBD, deploymentId: DEP, currentRevisionId: 'rev-2', targetRevisionId: 'rev-1', authorizedBy: 'p', authorizedAt: NOW })
  }

  it('valid directive + known target → SUCCESS result', () => {
    const result = executeRollback(makeDirective(), { knownRevisionIds: ['rev-1', 'rev-2'], executedAt: NOW })
    expect(result.outcome).toBe('SUCCESS')
    expect(result.directiveId).toBe(RBD)
  })

  it('target revision not in known set throws DEPLOYMENT_ROLLBACK_UNKNOWN_TARGET', () => {
    expect(() => executeRollback(makeDirective(), { knownRevisionIds: ['rev-2'], executedAt: NOW }))
      .toThrow('DEPLOYMENT_ROLLBACK_UNKNOWN_TARGET')
  })

  it('recommendation passed as directive throws DEPLOYMENT_RECOMMENDATION_NOT_DIRECTIVE', () => {
    const fakeDirective = { ...makeDirective(), isRecommendation: true }
    expect(() => executeRollback(fakeDirective as any, { knownRevisionIds: ['rev-1'], executedAt: NOW }))
      .toThrow('DEPLOYMENT_RECOMMENDATION_NOT_DIRECTIVE')
  })

  it('result has directiveHash', () => {
    const d = makeDirective()
    const result = executeRollback(d, { knownRevisionIds: ['rev-1'], executedAt: NOW })
    expect(result.directiveHash).toBe(d.directiveHash)
  })
})

// ── idempotency / conflict ────────────────────────────────────────────────────

describe('buildRollbackDirective: idempotency', () => {
  it('same directiveId twice is idempotent', () => {
    const store = new Map<string, RollbackDirective>()
    const input = { directiveId: RBD, deploymentId: DEP, currentRevisionId: 'rev-2', targetRevisionId: 'rev-1', authorizedBy: 'p', authorizedAt: NOW }
    const d1 = buildRollbackDirective(input, store)
    const d2 = buildRollbackDirective(input, store)
    expect(d1.directiveHash).toBe(d2.directiveHash)
    expect(store.size).toBe(1)
  })

  it('same directiveId different target throws DEPLOYMENT_EVIDENCE_FAILURE', () => {
    const store = new Map<string, RollbackDirective>()
    buildRollbackDirective({ directiveId: RBD, deploymentId: DEP, currentRevisionId: 'rev-2', targetRevisionId: 'rev-1', authorizedBy: 'p', authorizedAt: NOW }, store)
    expect(() => buildRollbackDirective({ directiveId: RBD, deploymentId: DEP, currentRevisionId: 'rev-2', targetRevisionId: 'rev-0', authorizedBy: 'p', authorizedAt: NOW }, store))
      .toThrow('DEPLOYMENT_EVIDENCE_FAILURE')
  })
})

// ── retirement ────────────────────────────────────────────────────────────────

describe('buildRetirementRecord', () => {
  it('valid retirement is built', () => {
    const r = buildRetirementRecord({ retirementId: RET, deploymentId: DEP, retiredBy: 'principal-1', retiredAt: NOW, activeConsumerCount: 0 })
    expect(r.retirementId).toBe(RET)
    expect(r.retirementHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('active consumers block retirement with DEPLOYMENT_RETIREMENT_ACTIVE_CONSUMERS', () => {
    expect(() => buildRetirementRecord({ retirementId: RET, deploymentId: DEP, retiredBy: 'p', retiredAt: NOW, activeConsumerCount: 3 }))
      .toThrow('DEPLOYMENT_RETIREMENT_ACTIVE_CONSUMERS')
  })

  it('empty retiredBy throws DEPLOYMENT_INVALID_IDENTITY', () => {
    expect(() => buildRetirementRecord({ retirementId: RET, deploymentId: DEP, retiredBy: '', retiredAt: NOW, activeConsumerCount: 0 }))
      .toThrow('DEPLOYMENT_INVALID_IDENTITY')
  })

  it('retirementHash is deterministic', () => {
    const input = { retirementId: RET, deploymentId: DEP, retiredBy: 'p', retiredAt: NOW, activeConsumerCount: 0 }
    expect(buildRetirementRecord(input).retirementHash).toBe(buildRetirementRecord(input).retirementHash)
  })
})
