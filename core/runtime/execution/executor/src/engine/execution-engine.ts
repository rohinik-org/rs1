import { createHash } from 'node:crypto'
import type {
  WorkflowPlan, ExecutionPolicy, ExecutionCheckpoint,
  ExecutionResult, ExecutionEvent, ExecutionState, StepExecutionRecord,
} from '@rohinik-org/compiler'
import type { ExecutionKernel, ExecutionHandle } from './execution-kernel.js'
import type { ExecutionScheduler } from '../scheduler/execution-scheduler.js'
import type { ExecutorCapabilityResolver } from '../resolver/capability-resolver.js'
import type { ExecutionStore } from '../store/execution-store.js'
import { ExecutionContext } from '../state/execution-context.js'
import { ExecutionStateMachine } from '../state/execution-state-machine.js'
import { ExecutionJournal } from '../journal/execution-journal.js'
import { ExecutionEventBus } from '../journal/execution-event-bus.js'
import { ExecutionMetricsCollector } from '../metrics/execution-metrics-collector.js'
import { StepExecutor } from '../executor/step-executor.js'
import { ExecutionResultBuilder } from '../result/execution-result-builder.js'

// ponytail: revision counter per engine instance; incremented on each execute() call
let _revisionCounter = 0

export class ExecutionEngine implements ExecutionKernel {
  constructor(
    private readonly resolver: ExecutorCapabilityResolver,
    private readonly scheduler: ExecutionScheduler,
    private readonly store: ExecutionStore,
  ) {}

  async execute(plan: WorkflowPlan, policy?: ExecutionPolicy): Promise<ExecutionHandle> {
    const executionId = createHash('sha256')
      .update(JSON.stringify({ planId: plan.planId, ts: Date.now(), rev: ++_revisionCounter }))
      .digest('hex')
      .slice(0, 16)

    return this._run(executionId, 1, plan, policy ?? {}, [], 0)
  }

  async resume(checkpoint: ExecutionCheckpoint, policy?: ExecutionPolicy): Promise<ExecutionHandle> {
    const stored = await this.store.loadResult(checkpoint.executionId)
    if (!stored) throw new Error(`No result found for executionId: ${checkpoint.executionId}`)
    // ponytail: resume rebuilds from checkpoint; full journal replay deferred to Stage 6B
    return this._run(
      checkpoint.executionId,
      checkpoint.executionRevision + 1,
      stored as unknown as WorkflowPlan,
      policy ?? {},
      checkpoint.completedSteps,
      checkpoint.journalOffset,
    )
  }

  async cancel(executionId: string): Promise<void> {
    // ponytail: in-flight cancellation signal added when long-running providers exist (Stage 6D)
    void executionId
  }

  async getResult(executionId: string): Promise<ExecutionResult | null> {
    return (await this.store.loadResult(executionId)) ?? null
  }

  private _run(
    executionId: string,
    revision: number,
    plan: WorkflowPlan,
    policy: ExecutionPolicy,
    skipPositions: readonly number[],
    _journalOffset: number,
  ): ExecutionHandle {
    const sm = new ExecutionStateMachine()
    const ctx = new ExecutionContext(executionId, plan.planId)
    const journal = new ExecutionJournal(executionId, revision)
    const bus = new ExecutionEventBus(plan.planId)
    const metrics = new ExecutionMetricsCollector()
    const builder = new ExecutionResultBuilder()

    // Bridge journal → event bus
    const origAppend = journal.append.bind(journal)
    journal.append = (eventType, payload?, stepPosition?) => {
      const entry = origAppend(eventType, payload, stepPosition)
      bus.emit(entry)
      return entry
    }

    metrics.start()
    sm.transition('RUNNING')

    const maxRetries = policy.maxRetries ?? 3
    const stepExecutor = new StepExecutor(this.resolver, { maxRetries, baseDelayMs: 0 })
    const scheduled = this.scheduler.schedule(plan.steps)

    let resolveResult!: (r: ExecutionResult) => void
    const resultPromise = new Promise<ExecutionResult>(r => { resolveResult = r })

    journal.append('EXECUTION_STARTED', { planId: plan.planId })

    const run = async () => {
      const stepRecords: StepExecutionRecord[] = []
      let failed = false

      for (const { step } of scheduled) {
        if (skipPositions.includes(step.position)) continue

        const record = await stepExecutor.execute(step, ctx, journal, metrics)
        stepRecords.push(record)

        if (record.state === 'FAILED') {
          if (!policy.continueOnFailure) { failed = true; break }
        }

        const checkpoint: ExecutionCheckpoint = {
          executionId,
          executionRevision: revision,
          planId: plan.planId,
          completedSteps: ctx.completedSteps,
          currentStep: step.position + 1,
          executionContextHash: ctx.hash(),
          journalOffset: journal.size,
          savedAt: new Date().toISOString(),
        }
        await this.store.saveCheckpoint(checkpoint)
        journal.append('CHECKPOINT_SAVED', { journalOffset: journal.size }, step.position)
      }

      const termination = failed
        ? { reason: 'FAILED' as const, message: 'A step failed and continueOnFailure is false' }
        : { reason: 'SUCCESS' as const }

      const eventType = failed ? 'EXECUTION_FAILED' : 'EXECUTION_COMPLETED'
      sm.transition(failed ? 'FAILED' : 'COMPLETED')
      journal.append(eventType, { reason: termination.reason })

      const result = builder.build({
        executionId, executionRevision: revision, planId: plan.planId,
        context: ctx, journal, metrics,
        stepRecords,
        termination,
      })

      await this.store.saveResult(result)
      bus.close()
      resolveResult(result)
    }

    void run()

    return {
      executionId,
      get state(): ExecutionState { return sm.state },
      cancel: async () => { /* Stage 6D */ },
      wait: () => resultPromise,
      events: () => bus.subscribe(),
    }
  }
}
