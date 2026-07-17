import type { CapabilityCandidate, CapabilityQuery } from '@rohinik-org/compiler'
import type { CapabilitySource } from './capability-source.js'

export class NullCapabilitySource implements CapabilitySource {
  readonly sourceId = 'null'

  async discover(_query: CapabilityQuery): Promise<CapabilityCandidate[]> {
    return []
  }
}
