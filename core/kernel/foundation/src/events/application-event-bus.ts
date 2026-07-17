import type { ApplicationEvent, ApplicationEventHandler } from '@rohinik-org/compiler'

export class ApplicationEventBus {
  private readonly handlers = new Map<string, Set<ApplicationEventHandler>>()
  private readonly appId: string

  constructor(applicationId: string) {
    this.appId = applicationId
  }

  emit(type: string, payload?: unknown): void {
    const event: ApplicationEvent = {
      eventId: crypto.randomUUID(),
      applicationId: this.appId,
      type,
      payload,
      timestamp: new Date().toISOString(),
    }
    for (const h of this.handlers.get(type) ?? []) void h(event)
    for (const h of this.handlers.get('*') ?? []) void h(event)
  }

  on(type: string, handler: ApplicationEventHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type)!.add(handler)
    return () => this.off(type, handler)
  }

  off(type: string, handler: ApplicationEventHandler): void {
    this.handlers.get(type)?.delete(handler)
  }
}
