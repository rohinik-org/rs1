import { randomUUID } from 'node:crypto'
import type { EventBus, ExecutionContext, RuntimeServices } from '@rohinik-org/kernel'
import {
  ExecutionContextFactory,
  DEFAULT_SYSTEM_CONFIG,
  createRuntimeServices,
  DefaultDecisionTraceBuilder,
  RUNTIME_MODE_POLICIES,
} from '@rohinik-org/kernel'
import type {
  ExecutionRequest,
  ExecutionResult,
  ExecutionSession,
  ExecutionStepRecord,
  ExecutionEventPayload,
  ExecutionState,
  ExecutionStep,
} from '@rohinik-org/execution-ir'
import { ExecutionEvent as EE } from '@rohinik-org/execution-ir'
import type { ExecutionSessionStore } from '../session/execution-session-store.js'
import type { TaskScheduler } from '../scheduler/task-scheduler.js'
import type { SkillInvoker } from '../invoker/skill-invoker.js'

export class ExecutionSupervisor {
  private readonly services: RuntimeServices
  private readonly ctxFactory: ExecutionContextFactory
  private readonly cancelled = new Set<string>()

  constructor(
    private readonly invoker: SkillInvoker,
    private readonly scheduler: TaskScheduler,
    private readonly store: ExecutionSessionStore,
    private readonly events: EventBus,
  ) {
    this.services = createRuntimeServices(DEFAULT_SYSTEM_CONFIG)
    this.ctxFactory = new ExecutionContextFactory(DEFAULT_SYSTEM_CONFIG, this.services)
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const sessionId = randomUUID()
    const plan = request.decision.selectedPlan
    const startedAt = new Date()

    const initialStepRecords: ExecutionStepRecord[] = plan.steps.map(s => Object.freeze({
      stepId: s.stepId,
      skillId: s.skillId,
      state: 'CREATED' as ExecutionState,
      attemptCount: 0,
    }))

    let session: ExecutionSession = Object.freeze({
      sessionId,
      executionId: request.executionId,
      decisionId: request.decision.decisionId,
      planId: plan.planId,
      state: 'CREATED' as ExecutionState,
      stepRecords: Object.freeze(initialStepRecords),
      startedAt,
    })
    await this.store.save(session)
    await this._emit(session, EE.SESSION_CREATED)

    session = this._withState(session, 'READY')
    await this.store.save(session)
    await this._emit(session, EE.SESSION_STARTED)

    // Build ephemeral DAG (Law 49 — never stored)
    const ordered = this.scheduler.schedule(plan)

    session = this._withState(session, 'RUNNING')
    await this.store.save(session)

    const stepRecords = [...session.stepRecords.map(r => ({ ...r }))] as ExecutionStepRecord[]

    for (const step of ordered) {
      // Check cancellation
      if (this.cancelled.has(sessionId)) {
        session = this._withStateAndRecords(session, 'CANCELLED', stepRecords, { cancelledAt: new Date() })
        await this.store.save(session)
        await this._emit(session, EE.SESSION_CANCELLED, step.stepId)
        return this._buildResult(session, startedAt)
      }

      const recordIdx = stepRecords.findIndex(r => r.stepId === step.stepId)
      const stepStart = new Date()

      stepRecords[recordIdx] = Object.freeze({
        ...stepRecords[recordIdx]!,
        state: 'RUNNING' as ExecutionState,
        startedAt: stepStart,
      })
      session = this._withStateAndRecords(session, 'RUNNING', stepRecords)
      await this.store.save(session)
      await this._emit(session, EE.STEP_STARTED, step.stepId)

      const ctx = this._buildCtx(request, step)
      let outcome = await this.invoker.invoke(step, ctx).catch(err => ({
        status: 'FAILURE' as const,
        result: undefined,
        skillId: step.skillId,
        stepId: step.stepId,
        diagnostics: [{ code: 'INVOCATION_ERROR', message: String(err?.message ?? err) }],
        metrics: { durationMs: 0, resourceCost: { estimated: {} }, cacheHit: false },
        cacheable: false,
        retryable: false,
      }))
      let attempts = 1

      // Retry loop
      while (
        outcome.status !== 'SUCCESS' &&
        outcome.retryable &&
        attempts < step.retryPolicy.maxAttempts
      ) {
        attempts++
        stepRecords[recordIdx] = Object.freeze({
          ...stepRecords[recordIdx]!,
          state: 'RETRYING' as ExecutionState,
          attemptCount: attempts - 1,
        })
        session = this._withStateAndRecords(session, 'RUNNING', stepRecords)
        await this.store.save(session)
        await this._emit(session, EE.STEP_RETRYING, step.stepId)
        outcome = await this.invoker.invoke(step, ctx).catch(err => ({
          status: 'FAILURE' as const,
          result: undefined,
          skillId: step.skillId,
          stepId: step.stepId,
          diagnostics: [{ code: 'INVOCATION_ERROR', message: String(err?.message ?? err) }],
          metrics: { durationMs: 0, resourceCost: { estimated: {} }, cacheHit: false },
          cacheable: false,
          retryable: false,
        }))
      }

      if (outcome.status === 'SUCCESS') {
        stepRecords[recordIdx] = Object.freeze({
          ...stepRecords[recordIdx]!,
          state: 'COMPLETED' as ExecutionState,
          completedAt: new Date(),
          outcome,
          attemptCount: attempts,
        })
        session = this._withStateAndRecords(session, 'RUNNING', stepRecords)
        await this.store.save(session)
        await this._emit(session, EE.STEP_COMPLETED, step.stepId)
      } else if (outcome.status === 'TIMEOUT') {
        stepRecords[recordIdx] = Object.freeze({
          ...stepRecords[recordIdx]!,
          state: 'TIMED_OUT' as ExecutionState,
          completedAt: new Date(),
          outcome,
          attemptCount: attempts,
        })
        session = this._withStateAndRecords(session, 'TIMED_OUT', stepRecords, { completedAt: new Date() })
        await this.store.save(session)
        await this._emit(session, EE.SESSION_TIMED_OUT, step.stepId)
        return this._buildResult(session, startedAt)
      } else {
        stepRecords[recordIdx] = Object.freeze({
          ...stepRecords[recordIdx]!,
          state: 'FAILED' as ExecutionState,
          completedAt: new Date(),
          outcome,
          attemptCount: attempts,
        })
        session = this._withStateAndRecords(session, 'FAILED', stepRecords, { completedAt: new Date() })
        await this.store.save(session)
        await this._emit(session, EE.STEP_FAILED, step.stepId)
        await this._emit(session, EE.SESSION_FAILED)
        return this._buildResult(session, startedAt)
      }
    }

    session = this._withStateAndRecords(session, 'COMPLETED', stepRecords, { completedAt: new Date() })
    await this.store.save(session)
    await this._emit(session, EE.SESSION_COMPLETED)

    return this._buildResult(session, startedAt)
  }

  async cancel(sessionId: string): Promise<void> {
    this.cancelled.add(sessionId)
  }

  async getSession(sessionId: string): Promise<ExecutionSession | undefined> {
    return this.store.load(sessionId)
  }

  async getEvents(sessionId: string): Promise<ExecutionEventPayload[]> {
    return this.store.listEvents(sessionId)
  }

  private async _emit(session: ExecutionSession, event: ExecutionEvent, stepId?: string): Promise<void> {
    const base = {
      event,
      sessionId: session.sessionId,
      executionId: session.executionId,
      state: session.state,
      timestamp: new Date(),
    }
    const payload: ExecutionEventPayload = Object.freeze(
      stepId !== undefined ? { ...base, stepId } : base
    )
    await this.store.appendEvent(session.sessionId, payload)
    this.events.emit(event, payload)
  }

  private _withState(session: ExecutionSession, state: ExecutionState): ExecutionSession {
    return Object.freeze({ ...session, state })
  }

  private _withStateAndRecords(
    session: ExecutionSession,
    state: ExecutionState,
    stepRecords: ExecutionStepRecord[],
    extra?: Partial<ExecutionSession>,
  ): ExecutionSession {
    return Object.freeze({
      ...session,
      state,
      stepRecords: Object.freeze([...stepRecords]),
      ...extra,
    })
  }

  private _buildCtx(request: ExecutionRequest, step: ExecutionStep): ExecutionContext {
    const routingRequest = {
      id: request.executionId,
      content: step.skillId,
      contentType: 'TEXT' as const,
      context: {},
      metadata: {},
      constraints: request.decision.selectedPlan.budget,
      timestamp: request.requestedAt,
    }
    return this.ctxFactory.create(routingRequest)
  }

  private _buildResult(session: ExecutionSession, startedAt: Date): ExecutionResult {
    return Object.freeze({
      resultId: randomUUID(),
      sessionId: session.sessionId,
      executionId: session.executionId,
      decisionId: session.decisionId,
      planId: session.planId,
      finalState: session.state,
      stepRecords: session.stepRecords,
      totalDurationMs: Date.now() - startedAt.getTime(),
      completedAt: new Date(),
    })
  }
}

// Re-export for internal use — avoids import churn in callers
type ExecutionEvent = typeof EE[keyof typeof EE]
