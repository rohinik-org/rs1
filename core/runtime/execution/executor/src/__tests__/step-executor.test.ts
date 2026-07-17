import { describe, it, expect, vi } from 'vitest'
import { StepExecutor } from '../executor/step-executor.js'
import { ExecutionContext } from '../state/execution-context.js'
import { ExecutionJournal } from '../journal/execution-journal.js'
import { ExecutionMetricsCollector } from '../metrics/execution-metrics-collector.js'
import type { WorkflowPlanStep, ProviderInvocation } from '@rohinik-org/compiler'
import type { ExecutorCapabilityResolver } from '../resolver/capability-resolver.js'

function makeStep(position: number, skillId: string): WorkflowPlanStep {
  return { position, skillId, expectedInputType: 'unknown', expectedOutputType: 'unknown', sourceWorkflowPosition: position }
}

function makeResolver(output: unknown = 'result'): ExecutorCapabilityResolver {
  return {
    resolve: (skillId, input): ProviderInvocation => ({
      skillId,
      input,
      invoke: async () => ({ output, providerUsed: 'mock', latencyMs: 10 }),
    }),
  }
}

describe('StepExecutor', () => {
  it('executes step and returns output', async () => {
    const ctx = new ExecutionContext('exec-1', 'plan-1')
    const journal = new ExecutionJournal('exec-1', 1)
    const metrics = new ExecutionMetricsCollector()
    const executor = new StepExecutor(makeResolver('csv_data'), { maxRetries: 0, baseDelayMs: 0 })
    const result = await executor.execute(makeStep(0, 'skill-read'), ctx, journal, metrics)
    expect(result.state).toBe('COMPLETED')
    expect(result.output).toBe('csv_data')
    expect(result.attempts).toBe(1)
  })

  it('emits STEP_STARTED and STEP_COMPLETED journal entries', async () => {
    const ctx = new ExecutionContext('exec-1', 'plan-1')
    const journal = new ExecutionJournal('exec-1', 1)
    const metrics = new ExecutionMetricsCollector()
    const executor = new StepExecutor(makeResolver(), { maxRetries: 0, baseDelayMs: 0 })
    await executor.execute(makeStep(0, 'skill-a'), ctx, journal, metrics)
    const types = journal.entries().map(e => e.eventType)
    expect(types).toContain('STEP_STARTED')
    expect(types).toContain('PROVIDER_INVOKED')
    expect(types).toContain('STEP_COMPLETED')
  })

  it('on provider failure, returns FAILED step record', async () => {
    const resolver: ExecutorCapabilityResolver = {
      resolve: (skillId, input): ProviderInvocation => ({
        skillId, input,
        invoke: async () => { throw new Error('provider down') },
      }),
    }
    const ctx = new ExecutionContext('exec-1', 'plan-1')
    const journal = new ExecutionJournal('exec-1', 1)
    const metrics = new ExecutionMetricsCollector()
    const executor = new StepExecutor(resolver, { maxRetries: 0, baseDelayMs: 0 })
    const result = await executor.execute(makeStep(0, 'skill-fail'), ctx, journal, metrics)
    expect(result.state).toBe('FAILED')
    expect(result.error).toContain('provider down')
  })

  it('retries on failure per policy', async () => {
    const invokeFn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ output: 'ok', providerUsed: 'mock', latencyMs: 5 })
    const resolver: ExecutorCapabilityResolver = {
      resolve: (skillId, input): ProviderInvocation => ({ skillId, input, invoke: invokeFn }),
    }
    const ctx = new ExecutionContext('exec-1', 'plan-1')
    const journal = new ExecutionJournal('exec-1', 1)
    const metrics = new ExecutionMetricsCollector()
    const executor = new StepExecutor(resolver, { maxRetries: 1, baseDelayMs: 0 })
    const result = await executor.execute(makeStep(0, 'skill-retry'), ctx, journal, metrics)
    expect(result.state).toBe('COMPLETED')
    expect(result.attempts).toBe(2)
  })
})
