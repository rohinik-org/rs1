import type { Goal } from '@rohinik-org/compiler'

export class GoalQueue {
  private readonly items: Goal[] = []

  enqueue(goal: Goal): void {
    this.items.push(goal)
    // Sort descending by priority; FIFO within same priority (stable sort)
    this.items.sort((a, b) => b.priority - a.priority)
  }

  dequeue(): Goal | undefined {
    return this.items.shift()
  }

  peek(): Goal | undefined {
    return this.items[0]
  }

  size(): number {
    return this.items.length
  }

  list(): Goal[] {
    return [...this.items]
  }

  cancel(goalId: string): boolean {
    const idx = this.items.findIndex(g => g.goalId === goalId)
    if (idx === -1) return false
    this.items.splice(idx, 1)
    return true
  }
}
