type Handler<T> = (payload: T) => void

export class EventBus {
  private readonly handlers = new Map<string, Map<string, Handler<unknown>>>()
  private nextId = 0

  subscribe<T>(event: string, handler: Handler<T>): string {
    const id = `sub-${++this.nextId}`
    if (!this.handlers.has(event)) this.handlers.set(event, new Map())
    this.handlers.get(event)!.set(id, handler as Handler<unknown>)
    return id
  }

  publish<T>(event: string, payload: T): void {
    this.handlers.get(event)?.forEach(h => h(payload))
  }

  unsubscribe(id: string): void {
    for (const handlers of this.handlers.values()) {
      if (handlers.delete(id)) return
    }
  }

  clear(): void {
    this.handlers.clear()
  }
}
