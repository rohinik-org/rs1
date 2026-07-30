import { describe, it, expect } from 'vitest'
import {
  ConformanceEngine,
  ConformanceRuleRegistry,
  reportJson,
  reportText,
} from '../conformance-engine.js'
import type { ConformanceRule, ConformanceSubject, RuleResult } from '../conformance-engine.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const RAN_AT = '2026-01-01T00:00:00.000Z'

function makeSubject(payload: unknown = { schemaVersion: 'rohinik.package/v1' }): ConformanceSubject {
  return { mode: 'source', payload }
}

function makeRule(ruleId: string, outcome: RuleResult['outcome'] = 'passed'): ConformanceRule {
  return {
    ruleId,
    kind: 'static',
    description: `Test rule ${ruleId}`,
    evaluate: async (subject) => ({
      ruleId,
      kind: 'static',
      outcome,
      issues: outcome === 'failed'
        ? [{ ruleId, severity: 'error', code: 'conformance-failed', message: `${ruleId} failed` }]
        : [],
    }),
  }
}

// ─── Ordering ─────────────────────────────────────────────────────────────────

describe('deterministic ordering', () => {
  it('rules execute in registration order', async () => {
    const registry = new ConformanceRuleRegistry()
    const order: string[] = []
    const makeTrackedRule = (id: string): ConformanceRule => ({
      ruleId: id,
      kind: 'static',
      description: id,
      evaluate: async () => {
        order.push(id)
        return { ruleId: id, kind: 'static', outcome: 'passed', issues: [] }
      },
    })
    registry.register(makeTrackedRule('b-rule'))
    registry.register(makeTrackedRule('a-rule'))
    const engine = new ConformanceEngine(registry)
    await engine.run(makeSubject(), RAN_AT)
    expect(order).toEqual(['b-rule', 'a-rule'])
  })

  it('output is deterministic for identical input', async () => {
    const registry = new ConformanceRuleRegistry()
    registry.register(makeRule('rule-1'))
    registry.register(makeRule('rule-2'))
    const engine = new ConformanceEngine(registry)
    const r1 = await engine.run(makeSubject(), RAN_AT)
    const r2 = await engine.run(makeSubject(), RAN_AT)
    expect(reportJson(r1)).toBe(reportJson(r2))
  })
})

// ─── One failure does not erase other findings ────────────────────────────────

describe('isolation', () => {
  it('one rule failure does not erase other findings', async () => {
    const registry = new ConformanceRuleRegistry()
    registry.register(makeRule('rule-pass'))
    registry.register(makeRule('rule-fail', 'failed'))
    registry.register(makeRule('rule-warn', 'warned'))
    const engine = new ConformanceEngine(registry)
    const result = await engine.run(makeSubject(), RAN_AT)
    expect(result.ruleResults).toHaveLength(3)
    expect(result.ruleResults.find((r) => r.ruleId === 'rule-pass')?.outcome).toBe('passed')
    expect(result.ruleResults.find((r) => r.ruleId === 'rule-fail')?.outcome).toBe('failed')
    expect(result.ruleResults.find((r) => r.ruleId === 'rule-warn')?.outcome).toBe('warned')
  })
})

// ─── Distinct outcomes ────────────────────────────────────────────────────────

describe('distinct outcomes', () => {
  it('invalid subject produces invalid-subject outcome', async () => {
    const registry = new ConformanceRuleRegistry()
    const engine = new ConformanceEngine(registry)
    const result = await engine.run({ mode: 'source', payload: null }, RAN_AT)
    expect(result.outcome).toBe('invalid-subject')
  })

  it('rule that throws produces internal-failure in result', async () => {
    const registry = new ConformanceRuleRegistry()
    const throwRule: ConformanceRule = {
      ruleId: 'throw-rule',
      kind: 'static',
      description: 'throws',
      evaluate: async () => { throw new Error('boom') },
    }
    registry.register(throwRule)
    const engine = new ConformanceEngine(registry)
    const result = await engine.run(makeSubject(), RAN_AT)
    expect(result.outcome).toBe('failed')
    const rr = result.ruleResults.find((r) => r.ruleId === 'throw-rule')!
    expect(rr.outcome).toBe('internal-failure')
  })

  it('blocked rule propagates blocked outcome', async () => {
    const registry = new ConformanceRuleRegistry()
    registry.register(makeRule('blocked-rule', 'blocked'))
    const engine = new ConformanceEngine(registry)
    const result = await engine.run(makeSubject(), RAN_AT)
    expect(result.outcome).toBe('blocked')
  })

  it('passed with no failures', async () => {
    const registry = new ConformanceRuleRegistry()
    registry.register(makeRule('ok-rule'))
    const engine = new ConformanceEngine(registry)
    const result = await engine.run(makeSubject(), RAN_AT)
    expect(result.outcome).toBe('passed')
  })
})

// ─── Duplicate rule IDs ───────────────────────────────────────────────────────

describe('duplicate rule IDs', () => {
  it('duplicate rule id throws at registration', () => {
    const registry = new ConformanceRuleRegistry()
    registry.register(makeRule('rule-x'))
    let err: unknown
    try { registry.register(makeRule('rule-x')) } catch (e) { err = e }
    expect((err as { code: string }).code).toBe('validation-failed')
  })
})

// ─── Static rules never execute package code ──────────────────────────────────

describe('static checks never execute package code', () => {
  it('static rule receives subject payload but does not invoke it', async () => {
    let invoked = false
    const payload = { schemaVersion: 'rohinik.package/v1', __exec: () => { invoked = true } }
    const rule: ConformanceRule = {
      ruleId: 'static-rule',
      kind: 'static',
      description: 'static only',
      evaluate: async (sub) => {
        // Safe: only read payload fields, never call functions
        const _ = (sub.payload as Record<string, unknown>)['schemaVersion']
        return { ruleId: 'static-rule', kind: 'static', outcome: 'passed', issues: [] }
      },
    }
    const registry = new ConformanceRuleRegistry()
    registry.register(rule)
    const engine = new ConformanceEngine(registry)
    await engine.run({ mode: 'source', payload }, RAN_AT)
    expect(invoked).toBe(false)
  })
})

// ─── Reporters ────────────────────────────────────────────────────────────────

describe('reporters', () => {
  it('reportJson produces valid JSON', async () => {
    const registry = new ConformanceRuleRegistry()
    registry.register(makeRule('r1'))
    const engine = new ConformanceEngine(registry)
    const result = await engine.run(makeSubject(), RAN_AT)
    expect(() => JSON.parse(reportJson(result))).not.toThrow()
  })

  it('reportText contains outcome and rule id', async () => {
    const registry = new ConformanceRuleRegistry()
    registry.register(makeRule('r1', 'failed'))
    const engine = new ConformanceEngine(registry)
    const result = await engine.run(makeSubject(), RAN_AT)
    const text = reportText(result)
    expect(text).toContain('FAILED')
    expect(text).toContain('r1')
  })
})
