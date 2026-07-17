import type { CapabilityCandidate } from '@rohinik-org/compiler'

export class SandboxValidator {
  // ponytail: always PASS; real process isolation deferred to Stage 6D
  validate(_candidate: CapabilityCandidate): { name: 'sandbox'; status: 'PASS' } {
    return { name: 'sandbox', status: 'PASS' }
  }
}
