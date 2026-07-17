import type { LoopHandle } from '../engine/loop-engine.js'
import type { GoalQueue } from '../queue/goal-queue.js'
import { Heartbeat } from './heartbeat.js'
import { RecoveryManager } from './recovery-manager.js'
import type { LoopJournal } from '../journal/loop-journal.js'
import type { LoopStore } from '../store/loop-store.js'

export class RuntimeSupervisor {
  private readonly heartbeat: Heartbeat
  private readonly recovery: RecoveryManager

  constructor(
    private readonly journal: LoopJournal,
    private readonly store: LoopStore,
    private readonly queue: GoalQueue,
    private readonly heartbeatIntervalMs = 5_000,
  ) {
    this.heartbeat = new Heartbeat(journal)
    this.recovery = new RecoveryManager(store)
  }

  attach(handle: LoopHandle): void {
    this.heartbeat.start(this.heartbeatIntervalMs)
    if (handle.state === 'CRASHED') {
      void this.recoverFrom(handle.loopId)
    }
  }

  async recoverFrom(loopId: string): Promise<void> {
    const goals = await this.recovery.recover(loopId)
    for (const goal of goals) {
      this.queue.enqueue(goal)
    }
    await this.journal.append('LOOP_STARTED', { recovered: true })
  }

  detach(): void {
    this.heartbeat.stop()
  }
}
