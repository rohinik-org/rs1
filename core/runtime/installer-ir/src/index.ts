import type { CapabilityCandidate } from '@rohinik-org/compiler'

export interface Installer {
  install(candidate: CapabilityCandidate): Promise<void>
}
