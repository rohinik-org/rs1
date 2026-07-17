import type { LoopJournal } from '../journal/loop-journal.js'

export class Heartbeat {
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(private readonly journal: LoopJournal) {}

  start(intervalMs: number): void {
    if (this.timer !== undefined) return
    this.timer = setInterval(() => {
      void this.journal.append('HEARTBEAT')
    }, intervalMs)
  }

  stop(): void {
    if (this.timer === undefined) return
    clearInterval(this.timer)
    this.timer = undefined
  }
}
