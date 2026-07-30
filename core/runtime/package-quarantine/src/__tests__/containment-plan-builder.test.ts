import { describe, it, expect } from 'vitest'
import { buildContainmentPlan } from '../containment-plan-builder.js'
import { makeSubject } from './fixtures.js'

const BASE = {
  operationId: 'op-1',
  subject: makeSubject(),
  trustDecisionId: 'td-1',
  sourceLocation: 'staging/art.tgz',
  destinationLocation: 'quarantine/test-pkg/1.0.0/op-1',
  plannedAt: '2026-07-30T00:00:00.000Z',
}

describe('ContainmentPlanBuilder', () => {
  it('isolate mode has correct steps', () => {
    const plan = buildContainmentPlan({ ...BASE, mode: 'isolate' })
    const stepKinds = plan.steps.map(s => s.step)
    expect(stepKinds).toContain('acquire-lock')
    expect(stepKinds).toContain('seal-source')
    expect(stepKinds).toContain('move-artifact')
    expect(stepKinds).toContain('verify-destination')
    expect(stepKinds).not.toContain('copy-artifact')
  })

  it('copy-and-seal mode has copy + remove-activation', () => {
    const plan = buildContainmentPlan({ ...BASE, mode: 'copy-and-seal' })
    const stepKinds = plan.steps.map(s => s.step)
    expect(stepKinds).toContain('copy-artifact')
    expect(stepKinds).toContain('remove-activation-reference')
    expect(stepKinds).not.toContain('move-artifact')
  })

  it('seal mode does not create namespace or move/copy', () => {
    const plan = buildContainmentPlan({ ...BASE, mode: 'seal' })
    const stepKinds = plan.steps.map(s => s.step)
    expect(stepKinds).not.toContain('create-namespace')
    expect(stepKinds).not.toContain('move-artifact')
    expect(stepKinds).not.toContain('copy-artifact')
  })

  it('manual-containment has manual-intervention rollback strategy', () => {
    const plan = buildContainmentPlan({ ...BASE, mode: 'manual-containment' })
    expect(plan.rollbackStrategy).toBe('manual-intervention')
  })

  it('isolate has preserve-source rollback strategy', () => {
    const plan = buildContainmentPlan({ ...BASE, mode: 'isolate' })
    expect(plan.rollbackStrategy).toBe('preserve-source')
  })

  it('deny-activation has correct steps', () => {
    const plan = buildContainmentPlan({ ...BASE, mode: 'deny-activation' })
    const stepKinds = plan.steps.map(s => s.step)
    expect(stepKinds).toContain('remove-activation-reference')
    expect(stepKinds).not.toContain('seal-source')
  })
})
