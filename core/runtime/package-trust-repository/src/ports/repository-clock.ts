import type { RepositoryClock } from '../types.js'

export function createWallClock(): RepositoryClock {
  return { now: () => new Date().toISOString() }
}
