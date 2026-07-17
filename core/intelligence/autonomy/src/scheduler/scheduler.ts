export class Scheduler {
  private readonly ticks = new Map<string, ReturnType<typeof setTimeout>>()
  private nextId = 0

  schedule(callback: () => void, delayMs: number, recurring = false): string {
    const id = `tick-${++this.nextId}`
    const fire = () => {
      callback()
      if (recurring) {
        this.ticks.set(id, setTimeout(fire, delayMs))
      } else {
        this.ticks.delete(id)
      }
    }
    this.ticks.set(id, setTimeout(fire, delayMs))
    return id
  }

  cancel(tickId: string): void {
    const handle = this.ticks.get(tickId)
    if (handle !== undefined) {
      clearTimeout(handle)
      this.ticks.delete(tickId)
    }
  }

  clear(): void {
    for (const handle of this.ticks.values()) clearTimeout(handle)
    this.ticks.clear()
  }
}
