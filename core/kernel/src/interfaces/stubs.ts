import type { Provider } from './provider.js'
import type { ExecutionContext } from '../domain/context.js'

// Phase 2 stub — do not implement until Memory OS phase
export interface MemoryResult<T = unknown> {
  readonly key: string
  readonly value: T
  readonly score: number
}

export interface MemoryProvider extends Provider {
  search(query: string, ctx: ExecutionContext): Promise<MemoryResult[]>
  store(key: string, value: unknown, ctx: ExecutionContext): Promise<void>
  update(key: string, value: unknown, ctx: ExecutionContext): Promise<void>
  delete(key: string, ctx: ExecutionContext): Promise<void>
}
