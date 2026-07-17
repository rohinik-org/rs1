import { randomUUID } from 'node:crypto'
import type {
  AutonomyPolicy, AutonomyReport, LoopState, ObservationQuery, LearningTrigger,
} from '@rohinik-org/compiler'
import { DEFAULT_AUTONOMY_POLICY } from '@rohinik-org/compiler'
import type { GoalQueue } from '../queue/goal-queue.js'
import type { TriggerRouter } from '../router/trigger-router.js'
import type { ApprovalManager } from '../approval/approval-manager.js'
import type { LoopJournal } from '../journal/loop-journal.js'
import type { ObservationPlanner } from '../observation/observation-planner.js'

// Minimal interfaces — avoid coupling to full package types
export interface ObservationEnginePort {
  observe(query: ObservationQuery): Promise<{ triggers: LearningTrigger[] }>
}

export interface WorkflowPlannerPort {
  plan(intent: unknown, translation: unknown, candidates: unknown[], graphRevision: number, revision: number): import('@rohinik-org/compiler').WorkflowPlan
}

export interface ExecutionEnginePort {
  execute(plan: import('@rohinik-org/compiler').WorkflowPlan): Promise<{ wait(): Promise<import('@rohinik-org/compiler').ExecutionResult> }>
}

export interface EpisodicRecorderPort {
  record(result: import('@rohinik-org/compiler').ExecutionResult): Promise<unknown>
}

export interface LoopHandle {
  readonly loopId: string
  readonly state: LoopState
  pause(): void
  resume(): void
  stop(): void
  report(): AutonomyReport
}

export class LoopEngine {
  private loopState: LoopState = 'IDLE'
  private cycleCount = 0
  private goalsCreated = 0
  private goalsCompleted = 0
  private goalsFailed = 0
  private goalsDeferred = 0
  private readonly startedAt = new Date().toISOString()
  private readonly loopId = randomUUID()

  constructor(
    private readonly observationEngine: ObservationEnginePort,
    private readonly observationPlanner: ObservationPlanner,
    private readonly triggerRouter: TriggerRouter,
    private readonly approvalManager: ApprovalManager,
    private readonly workflowPlanner: WorkflowPlannerPort,
    private readonly executionEngine: ExecutionEnginePort,
    private readonly episodicRecorder: EpisodicRecorderPort,
    private readonly goalQueue: GoalQueue,
    private readonly journal: LoopJournal,
    private readonly policy: AutonomyPolicy = DEFAULT_AUTONOMY_POLICY,
  ) {}

  async tick(): Promise<void> {
    if (this.loopState !== 'RUNNING') return
    this.cycleCount++
    await this.journal.append('CYCLE_STARTED', { cycleNumber: this.cycleCount }, undefined, this.cycleCount)

    // Step 1: Observation
    const state = this._runtimeState()
    const queries = this.observationPlanner.plan(state, this.policy)
    for (const query of queries) {
      const { triggers } = await this.observationEngine.observe(query)
      for (const trigger of triggers) {
        await this.journal.append('TRIGGER_RECEIVED', { triggerId: trigger.triggerId }, undefined, this.cycleCount)
        const goal = this.triggerRouter.route(trigger)
        this.goalsCreated++
        this.goalQueue.enqueue(goal)
      }
    }

    // Step 2: Process queued goals
    let goal = this.goalQueue.dequeue()
    while (goal) {
      const status = this.approvalManager.evaluate(goal, this.policy)
      if (status === 'DEFERRED') {
        this.goalsDeferred++
        await this.journal.append('GOAL_DEFERRED', {}, goal.goalId, this.cycleCount)
        goal = this.goalQueue.dequeue()
        continue
      }
      if (status === 'REJECTED') {
        await this.journal.append('GOAL_REJECTED', {}, goal.goalId, this.cycleCount)
        goal = this.goalQueue.dequeue()
        continue
      }

      // APPROVED — plan → execute → remember
      await this.journal.append('GOAL_EXECUTING', {}, goal.goalId, this.cycleCount)
      try {
        const plan = this.workflowPlanner.plan(goal.intent, goal.intent, [], 0, 0)
        const handle = await this.executionEngine.execute(plan)
        const result = await handle.wait()
        await this.episodicRecorder.record(result)
        this.goalsCompleted++
        await this.journal.append('GOAL_COMPLETED', {}, goal.goalId, this.cycleCount)
      } catch {
        this.goalsFailed++
        await this.journal.append('GOAL_FAILED', {}, goal.goalId, this.cycleCount)
      }
      goal = this.goalQueue.dequeue()
    }

    await this.journal.append('CYCLE_COMPLETED', { cycleNumber: this.cycleCount }, undefined, this.cycleCount)
  }

  start(): LoopHandle {
    this.loopState = 'RUNNING'
    void this.journal.append('LOOP_STARTED')
    const self = this
    return {
      get loopId() { return self.loopId },
      get state() { return self.loopState },
      pause() { self.pause() },
      resume() { self.resume() },
      stop() { self.stop() },
      report() { return self._report() },
    }
  }

  pause(): void {
    if (this.loopState === 'RUNNING') {
      this.loopState = 'PAUSED'
      void this.journal.append('LOOP_PAUSED')
    }
  }

  resume(): void {
    if (this.loopState === 'PAUSED') {
      this.loopState = 'RUNNING'
      void this.journal.append('LOOP_RESUMED')
    }
  }

  stop(): void {
    if (this.loopState === 'RUNNING' || this.loopState === 'PAUSED') {
      this.loopState = 'STOPPED'
      void this.journal.append('LOOP_STOPPED')
    }
  }

  private _runtimeState(): import('@rohinik-org/compiler').RuntimeState {
    return {
      loopId: this.loopId,
      loopState: this.loopState,
      cycleCount: this.cycleCount,
      activeGoals: 0,
      queueDepth: this.goalQueue.size(),
      uptimeMs: Date.now(),
    }
  }

  private _report(): AutonomyReport {
    return {
      kind: 'AutonomyReport', schemaVersion: '1.0',
      reportId: randomUUID(),
      loopId: this.loopId,
      startedAt: this.startedAt,
      state: this.loopState,
      cycleCount: this.cycleCount,
      goalsCreated: this.goalsCreated,
      goalsCompleted: this.goalsCompleted,
      goalsFailed: this.goalsFailed,
      goalsDeferred: this.goalsDeferred,
    }
  }
}
