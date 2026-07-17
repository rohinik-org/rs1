import type { NetworkResponse } from '@rohinik-org/compiler'

export interface NetworkCache {
  get(key: string): NetworkResponse | undefined
  set(key: string, value: NetworkResponse, ttlMs: number): void
}

export class NullNetworkCache implements NetworkCache {
  get(_key: string): NetworkResponse | undefined { return undefined }
  set(_key: string, _value: NetworkResponse, _ttlMs: number): void {}
}

interface CacheEntry { value: NetworkResponse; expiresAt: number }

export class InMemoryNetworkCache implements NetworkCache {
  private readonly store = new Map<string, CacheEntry>()

  get(key: string): NetworkResponse | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) { this.store.delete(key); return undefined }
    return entry.value
  }

  set(key: string, value: NetworkResponse, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }
}
