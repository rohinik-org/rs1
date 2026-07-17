import type { CacheService } from '../domain/context.js'

export class NullCacheService implements CacheService {
  async get<T>(_key: string): Promise<T | undefined> {
    return undefined
  }

  async set<T>(_key: string, _value: T, _ttlMs?: number): Promise<void> {
    // Phase 1: no-op
  }
}
