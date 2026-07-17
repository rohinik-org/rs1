import type { Goal } from '@rohinik-org/compiler'
import type { LoopStore } from '../store/loop-store.js'

export class RecoveryManager {
  constructor(private readonly store: LoopStore) {}

  async recover(loopId: string): Promise<Goal[]> {
    const [pending, executing] = await Promise.all([
      this.store.listGoals('PENDING'),
      this.store.listGoals('EXECUTING'),
    ])
    // Return goals that belong to this loop (via triggerRef or any goal in store for this loop)
    // ponytail: LoopStore doesn't partition by loopId for goals; return all unfinished goals
    return [...pending, ...executing]
  }
}
