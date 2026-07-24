import { randomUUID } from 'node:crypto'
import type { IdGenerator, Clock, IsoTimestamp } from '@rohinik-org/capability-contracts-ir'

// §6 — Default production implementations.
export function createProductionIdGenerator(): IdGenerator {
  return { generate: () => randomUUID() }
}

export function createProductionClock(): Clock {
  return { now: () => new Date().toISOString() as IsoTimestamp }
}
