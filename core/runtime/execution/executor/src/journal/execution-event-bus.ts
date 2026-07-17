import type { ExecutionJournalEntry, ExecutionEvent } from '@rohinik-org/compiler'

export class ExecutionEventBus {
  private readonly subscribers: Array<(entry: ExecutionEvent | null) => void> = []
  private readonly history: ExecutionEvent[] = []
  private closed = false

  constructor(private readonly planId: string) {}

  emit(entry: ExecutionJournalEntry): void {
    if (this.closed) return
    const event: ExecutionEvent = { ...entry, planId: this.planId }
    this.history.push(event)
    for (const fn of this.subscribers) fn(event)
  }

  close(): void {
    this.closed = true
    for (const fn of this.subscribers) fn(null)
    this.subscribers.length = 0
  }

  subscribe(): AsyncIterable<ExecutionEvent> {
    // ponytail: replay history so late subscribers don't miss events already fired
    const queue: Array<ExecutionEvent | null> = [...this.history]
    if (this.closed) queue.push(null)
    let resolve: (() => void) | null = null

    const push = (event: ExecutionEvent | null) => {
      queue.push(event)
      resolve?.()
    }

    if (!this.closed) this.subscribers.push(push)

    return {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<ExecutionEvent>> {
            while (queue.length === 0) {
              await new Promise<void>(r => { resolve = r })
              resolve = null
            }
            const item = queue.shift()!
            if (item === null) return { done: true, value: undefined as never }
            return { done: false, value: item }
          },
        }
      },
    }
  }
}
