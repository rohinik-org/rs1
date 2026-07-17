import type { ProviderEntry, ProviderRegistry as IProviderRegistry } from '@rohinik-org/compiler'

export class ProviderRegistry {
  private readonly _providers: Map<string, ProviderEntry> = new Map()

  register(entry: ProviderEntry): void {
    this._providers.set(entry.providerId, entry)
  }

  lookup(providerId: string): ProviderEntry | undefined {
    return this._providers.get(providerId)
  }

  list(): readonly ProviderEntry[] {
    return Array.from(this._providers.values())
  }

  snapshot(): IProviderRegistry {
    return { providers: this.list() }
  }
}
