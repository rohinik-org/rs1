import type { DecisionTrace } from '@rohinik-org/kernel'

export class DecisionStore {
  private readonly map = new Map<string, DecisionTrace>()
  private readonly order: string[] = []

  constructor(private readonly capacity: number) {}

  put(requestId: string, trace: DecisionTrace): void {
    if (this.map.has(requestId)) return
    if (this.order.length >= this.capacity) {
      const evicted = this.order.shift()!
      this.map.delete(evicted)
    }
    this.map.set(requestId, trace)
    this.order.push(requestId)
  }

  get(requestId: string): DecisionTrace | undefined {
    return this.map.get(requestId)
  }

  get size(): number {
    return this.map.size
  }
}
