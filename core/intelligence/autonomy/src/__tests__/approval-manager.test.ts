import { describe, it, expect } from 'vitest'
import { AutonomyPolicyEngine } from '../policy/autonomy-policy-engine.js'
import { ApprovalManager } from '../approval/approval-manager.js'
import type { Goal, AutonomyPolicy } from '@rohinik-org/compiler'
import { DEFAULT_AUTONOMY_POLICY } from '@rohinik-org/compiler'

const makeGoal = (origin: Goal['origin'] = 'USER'): Goal => ({
  kind: 'Goal', schemaVersion: '1.0', goalId: 'g-1', origin, priority: 50,
  intent: {
    intentId: 'i-1', schemaVersion: '1.0', rawInput: 'test', concepts: [],
    preferredSkills: [], constraints: {}, translatedBy: 'test', translationConfidence: 1, unresolvedTerms: [],
  },
  status: 'PENDING', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
})

describe('AutonomyPolicyEngine', () => {
  it('allows USER goal with default policy', () => {
    const engine = new AutonomyPolicyEngine()
    const result = engine.evaluate(makeGoal('USER'), DEFAULT_AUTONOMY_POLICY)
    expect(result.allowed).toBe(true)
  })

  it('rejects when allowSelfPlanning is false', () => {
    const policy: AutonomyPolicy = { ...DEFAULT_AUTONOMY_POLICY, allowSelfPlanning: false }
    const engine = new AutonomyPolicyEngine()
    const result = engine.evaluate(makeGoal('USER'), policy)
    expect(result.allowed).toBe(false)
  })

  it('rejects when allowSelfExecution is false', () => {
    const policy: AutonomyPolicy = { ...DEFAULT_AUTONOMY_POLICY, allowSelfExecution: false }
    const engine = new AutonomyPolicyEngine()
    const result = engine.evaluate(makeGoal('USER'), policy)
    expect(result.allowed).toBe(false)
  })

  it('blocks OBSERVATION origin (requireApprovalFor includes OBSERVATION by default)', () => {
    const engine = new AutonomyPolicyEngine()
    const result = engine.evaluate(makeGoal('OBSERVATION'), DEFAULT_AUTONOMY_POLICY)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('requires human approval')
  })
})

describe('ApprovalManager', () => {
  it('returns APPROVED for USER goal', () => {
    const mgr = new ApprovalManager()
    expect(mgr.evaluate(makeGoal('USER'), DEFAULT_AUTONOMY_POLICY)).toBe('APPROVED')
  })

  it('returns DEFERRED for OBSERVATION goal (requires human approval)', () => {
    const mgr = new ApprovalManager()
    expect(mgr.evaluate(makeGoal('OBSERVATION'), DEFAULT_AUTONOMY_POLICY)).toBe('DEFERRED')
  })

  it('returns REJECTED when allowSelfExecution false', () => {
    const policy: AutonomyPolicy = { ...DEFAULT_AUTONOMY_POLICY, allowSelfExecution: false }
    const mgr = new ApprovalManager()
    expect(mgr.evaluate(makeGoal('USER'), policy)).toBe('REJECTED')
  })
})
