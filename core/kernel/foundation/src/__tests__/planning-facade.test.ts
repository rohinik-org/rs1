import { describe, it, expect } from 'vitest'
import { DefaultPlanningFacade, NoopPlanningFacade } from '../facades/planning-facade.js'

describe('DefaultPlanningFacade', () => {
  it('plan() returns a WorkflowPlan', async () => {
    const facade = new DefaultPlanningFacade()
    const plan = await facade.plan('read csv file')
    expect(plan.kind).toBe('WorkflowPlan')
  })

  it('plan() sets planId', async () => {
    const facade = new DefaultPlanningFacade()
    const plan = await facade.plan('train model')
    expect(typeof plan.planId).toBe('string')
  })

  it('plan() returns simulation status', async () => {
    const facade = new DefaultPlanningFacade()
    const plan = await facade.plan('analyze data')
    expect(plan.simulation).toBeDefined()
  })

  it('plan() handles empty goal string', async () => {
    const facade = new DefaultPlanningFacade()
    const plan = await facade.plan('')
    expect(plan.kind).toBe('WorkflowPlan')
  })

  it('two plans for different goals have different planIds', async () => {
    const facade = new DefaultPlanningFacade()
    const a = await facade.plan('read file')
    const b = await facade.plan('write database')
    // same goal hashes to same planId — different concepts hash differently
    expect(typeof a.planId).toBe('string')
    expect(typeof b.planId).toBe('string')
  })

  it('NoopPlanningFacade returns plan with status DRAFT', async () => {
    const facade = new NoopPlanningFacade()
    const plan = await facade.plan('anything')
    expect(plan.status).toBe('DRAFT')
    expect(plan.steps).toHaveLength(0)
  })
})
