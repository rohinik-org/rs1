import { describe, it, expect } from 'vitest'
import { SequentialExecutionScheduler } from '../scheduler/sequential-execution-scheduler.js'
import type { WorkflowPlanStep } from '@rohinik-org/compiler'

function makeStep(position: number, skillId: string): WorkflowPlanStep {
  return {
    position,
    skillId,
    expectedInputType: 'unknown',
    expectedOutputType: 'unknown',
    sourceWorkflowPosition: position,
  }
}

describe('SequentialExecutionScheduler', () => {
  const scheduler = new SequentialExecutionScheduler()

  it('returns steps in position order', () => {
    const steps = [makeStep(2, 'skill-c'), makeStep(0, 'skill-a'), makeStep(1, 'skill-b')]
    const scheduled = scheduler.schedule(steps)
    expect(scheduled.map(s => s.position)).toEqual([0, 1, 2])
  })

  it('preserves all steps', () => {
    const steps = [makeStep(0, 'a'), makeStep(1, 'b'), makeStep(2, 'c')]
    expect(scheduler.schedule(steps).length).toBe(3)
  })

  it('returns empty for empty input', () => {
    expect(scheduler.schedule([])).toEqual([])
  })

  it('each scheduled step carries original step reference', () => {
    const step = makeStep(0, 'skill-a')
    const scheduled = scheduler.schedule([step])
    expect(scheduled[0]!.step).toBe(step)
  })
})
