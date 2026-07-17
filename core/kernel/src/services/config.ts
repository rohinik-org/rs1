import type { ConfigService } from '../domain/context.js'

export class InMemoryConfigService implements ConfigService {
  constructor(private readonly values: Record<string, unknown>) {}

  get<T>(key: string, defaultValue: T): T {
    const val = this.values[key]
    return val !== undefined ? (val as T) : defaultValue
  }
}
