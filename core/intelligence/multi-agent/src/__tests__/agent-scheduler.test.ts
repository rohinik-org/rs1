import { describe, it, expect } from 'vitest'
import { AgentScheduler } from '../scheduler/agent-scheduler.js'
import type { AgentTask } from '@rohinik-org/compiler'

function makeTask(id: string, planId?: string): AgentTask {
  return { taskId: id, goalId: 'g1', assignedAgentId: 'agent1', ...(planId ? { workflowPlanId: planId } : {}) }
}

describe('AgentScheduler', () => {
  const scheduler = new AgentScheduler()

  it('empty tasks → empty schedule', () => {
    expect(scheduler.schedule([], 'sequential').batches).toHaveLength(0)
  })

  it('sequential mode: one task per batch', () => {
    const s = scheduler.schedule([makeTask('t1'), makeTask('t2'), makeTask('t3')], 'sequential')
    expect(s.batches).toHaveLength(3)
    expect(s.batches.every(b => b.length === 1)).toBe(true)
  })

  it('parallel mode: all tasks in one batch', () => {
    const s = scheduler.schedule([makeTask('t1'), makeTask('t2'), makeTask('t3')], 'parallel')
    expect(s.batches).toHaveLength(1)
    expect(s.batches[0]).toHaveLength(3)
  })

  it('dependency mode: tasks without planId in batch 0', () => {
    const s = scheduler.schedule([makeTask('t1'), makeTask('t2', 'plan-a')], 'dependency')
    expect(s.batches[0]).toContainEqual(expect.objectContaining({ taskId: 't1' }))
  })

  it('dependency mode: tasks with same planId grouped', () => {
    const s = scheduler.schedule([makeTask('t1', 'plan-a'), makeTask('t2', 'plan-a'), makeTask('t3', 'plan-b')], 'dependency')
    const planABatch = s.batches.find(b => b.some(t => t.workflowPlanId === 'plan-a'))
    expect(planABatch).toHaveLength(2)
  })

  it('mode is preserved in schedule result', () => {
    const s = scheduler.schedule([makeTask('t1')], 'parallel')
    expect(s.mode).toBe('parallel')
  })
})
