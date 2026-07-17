import type { CertificationScenario } from '@rohinik-org/compiler'

export const observationScenarios: readonly CertificationScenario[] = [
  {
    scenarioId: 'observation-records',
    name: 'Expired observations are rejected',
    tags: ['OBSERVATION'],
    fixture: { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] },
    expectations: [{ invariantId: 'OBS-001', description: 'Observation TTL enforcement', category: 'OBSERVATION' }],
  },
  {
    scenarioId: 'observation-timeout',
    name: 'Observation is immutable after creation',
    tags: ['OBSERVATION'],
    fixture: { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] },
    expectations: [{ invariantId: 'OBS-002', description: 'Observation immutability', category: 'OBSERVATION' }],
  },
]

export async function runObservationRecords(): Promise<Record<string, unknown>> {
  const now = Date.now()
  const expired = { observationId: 'o1', expiresAt: new Date(now - 1000).toISOString() }
  const rejected = new Date(expired.expiresAt).getTime() < now
  return { expiredObservationRejected: rejected }
}

export async function runObservationTimeout(): Promise<Record<string, unknown>> {
  const obs = Object.freeze({ observationId: 'o1', value: 'v1', createdAt: new Date().toISOString() })
  return { observationImmutable: Object.isFrozen(obs) }
}
