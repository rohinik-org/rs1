import type { InteractionAdapter } from './types.js'

export class RuntimeInteractionBus {
  private readonly adapters = new Map<string, InteractionAdapter>()

  register(adapter: InteractionAdapter): void {
    this.adapters.set(adapter.id, adapter)
  }

  unregister(id: string): void {
    this.adapters.delete(id)
  }

  get(id: string): InteractionAdapter | undefined {
    return this.adapters.get(id)
  }

  list(): ReadonlyArray<InteractionAdapter> {
    return Array.from(this.adapters.values())
  }
}
