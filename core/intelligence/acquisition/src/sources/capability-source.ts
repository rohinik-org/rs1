import type { CapabilityCandidate, CapabilityQuery } from '@rohinik-org/compiler'

export interface CapabilitySource {
  readonly sourceId: string
  discover(query: CapabilityQuery): Promise<CapabilityCandidate[]>
}
