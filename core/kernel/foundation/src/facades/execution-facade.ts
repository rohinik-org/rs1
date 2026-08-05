import type { WorkflowPlan, ExecutionResult } from '@rohinik-org/compiler'
import type { ExecutionFacade } from './facade-types.js'
import type { ExecutionHandle } from '@rohinik-org/executor'
import { ExecutionEngine, SequentialExecutionScheduler, NullExecutionStore } from '@rohinik-org/executor'

const _nullResolver = {
  registryRevision: 0,
  resolveSkill: () => true,
  resolve: (skillId: string, input: unknown) => ({
    skillId,
    input,
    invoke: () => Promise.resolve({ output: null, providerUsed: 'null', latencyMs: 0 }),
  }),
}

export class DefaultExecutionFacade implements ExecutionFacade {
  private readonly engine = new ExecutionEngine(
    _nullResolver,
    new SequentialExecutionScheduler(),
    new NullExecutionStore(),
  )

  execute(plan: WorkflowPlan): Promise<ExecutionHandle> {
    return this.engine.execute(plan)
  }

  getResult(executionId: string): Promise<ExecutionResult | null> {
    return this.engine.getResult(executionId)
  }
}

export class NoopExecutionFacade implements ExecutionFacade {
  execute(_plan: WorkflowPlan): Promise<ExecutionHandle> {
    return Promise.resolve({
      executionId: '',
      state: 'COMPLETED' as const,
      cancel: () => Promise.resolve(),
      wait: () => Promise.resolve({ kind: 'ExecutionResult', schemaVersion: '1.0', executionId: '', executionRevision: 1, planId: '', metadata: { planId: '' }, termination: { reason: 'SUCCESS' }, stepRecords: [], journal: [], metrics: { totalDurationMs: 0, stepCount: 0, retryCount: 0, tokenCount: 0, providerLatencyMs: {}, startedAt: new Date().toISOString(), completedAt: new Date().toISOString() }, outputs: {}, producedAt: new Date().toISOString() } as unknown as import('@rohinik-org/compiler').ExecutionResult),
      events: () => ({ [Symbol.asyncIterator]: async function* () {} } as AsyncIterable<never>),
    })
  }

  getResult(_executionId: string): Promise<ExecutionResult | null> {
    return Promise.resolve(null)
  }
}
