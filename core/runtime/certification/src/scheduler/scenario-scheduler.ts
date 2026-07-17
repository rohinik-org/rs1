import type { CertificationScenario } from '@rohinik-org/compiler'

// FULL_PIPELINE scenarios run sequentially (own batch each); others can share batches
export function scheduleBatches(scenarios: readonly CertificationScenario[]): CertificationScenario[][] {
  const batches: CertificationScenario[][] = []
  let currentBatch: CertificationScenario[] = []

  for (const scenario of scenarios) {
    if (scenario.tags.includes('FULL_PIPELINE')) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch)
        currentBatch = []
      }
      batches.push([scenario])
    } else {
      currentBatch.push(scenario)
    }
  }

  if (currentBatch.length > 0) batches.push(currentBatch)
  return batches
}
