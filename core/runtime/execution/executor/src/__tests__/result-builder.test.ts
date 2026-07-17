import { describe, it, expect } from 'vitest'
import { ExecutionResultBuilder } from '../result/execution-result-builder.js'
import { ExecutionContext } from '../state/execution-context.js'
import { ExecutionJournal } from '../journal/execution-journal.js'
import { ExecutionMetricsCollector } from '../metrics/execution-metrics-collector.js'
import type { StepExecutionRecord } from '@rohinik-org/compiler'

function makeStepRecord(position: number, state: StepExecutionRecord['state']): StepExecutionRecord {
  return {
    stepId: `skill-${position}`,
    position,
    skillId: `skill-${position}`,
    state,
    attempts: 1,
  }
}

describe('ExecutionResultBuilder', () => {
  it('builds SUCCESS result when all steps completed', () => {
    const ctx = new ExecutionContext('exec-1', 'plan-1')
    const journal = new ExecutionJournal('exec-1', 1)
    const metrics = new ExecutionMetricsCollector()
    metrics.start()
    const records = [makeStepRecord(0, 'COMPLETED'), makeStepRecord(1, 'COMPLETED')]
    const result = new ExecutionResultBuilder().build({
      executionId: 'exec-1',
      executionRevision: 1,
      planId: 'plan-1',
      context: ctx,
      journal,
      metrics,
      stepRecords: records,
      termination: { reason: 'SUCCESS' },
    })
    expect(result.kind).toBe('ExecutionResult')
    expect(result.termination.reason).toBe('SUCCESS')
    expect(result.stepRecords.length).toBe(2)
    expect(result.journal).toBeDefined()
    expect(result.metrics).toBeDefined()
  })

  it('builds FAILED result when a step failed', () => {
    const ctx = new ExecutionContext('exec-1', 'plan-1')
    const journal = new ExecutionJournal('exec-1', 1)
    const metrics = new ExecutionMetricsCollector()
    metrics.start()
    const records = [makeStepRecord(0, 'COMPLETED'), makeStepRecord(1, 'FAILED')]
    const result = new ExecutionResultBuilder().build({
      executionId: 'exec-1',
      executionRevision: 1,
      planId: 'plan-1',
      context: ctx,
      journal,
      metrics,
      stepRecords: records,
      termination: { reason: 'FAILED', message: 'step 1 failed' },
    })
    expect(result.termination.reason).toBe('FAILED')
    expect(result.termination.message).toBe('step 1 failed')
  })

  it('outputs map reflects context outputs', () => {
    const ctx = new ExecutionContext('exec-1', 'plan-1')
    ctx.setOutput(0, 'csv_data')
    ctx.setOutput(1, 'transformed_data')
    const journal = new ExecutionJournal('exec-1', 1)
    const metrics = new ExecutionMetricsCollector()
    metrics.start()
    const result = new ExecutionResultBuilder().build({
      executionId: 'exec-1',
      executionRevision: 1,
      planId: 'plan-1',
      context: ctx,
      journal,
      metrics,
      stepRecords: [],
      termination: { reason: 'SUCCESS' },
    })
    expect(result.outputs[0]).toBe('csv_data')
    expect(result.outputs[1]).toBe('transformed_data')
  })
})
