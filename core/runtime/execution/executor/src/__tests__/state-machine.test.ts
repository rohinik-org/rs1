import { describe, it, expect } from 'vitest'
import { ExecutionStateMachine } from '../state/execution-state-machine.js'
import { ExecutionContext } from '../state/execution-context.js'

describe('ExecutionStateMachine', () => {
  it('starts in PENDING', () => {
    const sm = new ExecutionStateMachine()
    expect(sm.state).toBe('PENDING')
  })

  it('PENDING → RUNNING is valid', () => {
    const sm = new ExecutionStateMachine()
    sm.transition('RUNNING')
    expect(sm.state).toBe('RUNNING')
  })

  it('RUNNING → COMPLETED is valid', () => {
    const sm = new ExecutionStateMachine()
    sm.transition('RUNNING')
    sm.transition('COMPLETED')
    expect(sm.state).toBe('COMPLETED')
  })

  it('RUNNING → FAILED is valid', () => {
    const sm = new ExecutionStateMachine()
    sm.transition('RUNNING')
    sm.transition('FAILED')
    expect(sm.state).toBe('FAILED')
  })

  it('COMPLETED → RUNNING is invalid — throws', () => {
    const sm = new ExecutionStateMachine()
    sm.transition('RUNNING')
    sm.transition('COMPLETED')
    expect(() => sm.transition('RUNNING')).toThrow()
  })

  it('FAILED → RUNNING is invalid — throws', () => {
    const sm = new ExecutionStateMachine()
    sm.transition('RUNNING')
    sm.transition('FAILED')
    expect(() => sm.transition('RUNNING')).toThrow()
  })

  it('PENDING → CANCELLED is valid', () => {
    const sm = new ExecutionStateMachine()
    sm.transition('CANCELLED')
    expect(sm.state).toBe('CANCELLED')
  })
})

describe('ExecutionContext', () => {
  it('tracks currentStep', () => {
    const ctx = new ExecutionContext('exec-1', 'plan-1')
    expect(ctx.currentStep).toBe(0)
    ctx.advanceStep()
    expect(ctx.currentStep).toBe(1)
  })

  it('stores step outputs by position', () => {
    const ctx = new ExecutionContext('exec-1', 'plan-1')
    ctx.setOutput(0, { result: 'csv_data' })
    expect(ctx.getOutput(0)).toEqual({ result: 'csv_data' })
  })

  it('tracks completed steps', () => {
    const ctx = new ExecutionContext('exec-1', 'plan-1')
    ctx.markCompleted(0)
    ctx.markCompleted(1)
    expect(ctx.completedSteps).toEqual([0, 1])
  })

  it('hash is stable for same state', () => {
    const ctx = new ExecutionContext('exec-1', 'plan-1')
    ctx.setOutput(0, { x: 1 })
    const h1 = ctx.hash()
    const h2 = ctx.hash()
    expect(h1).toBe(h2)
  })

  it('hash changes after mutation', () => {
    const ctx = new ExecutionContext('exec-1', 'plan-1')
    const h1 = ctx.hash()
    ctx.setOutput(0, { x: 1 })
    const h2 = ctx.hash()
    expect(h1).not.toBe(h2)
  })
})
