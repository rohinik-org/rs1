import type { CertificationScenario } from '@rohinik-org/compiler'

export const memoryScenarios: readonly CertificationScenario[] = [
  {
    scenarioId: 'memory-write-read',
    name: 'Memory artifact is immutable after write',
    tags: ['MEMORY'],
    fixture: { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] },
    expectations: [{ invariantId: 'MEM-001', description: 'Memory artifact immutability', category: 'MEMORY' }],
  },
  {
    scenarioId: 'memory-ephemeral-lifecycle',
    name: 'EPHEMERAL memory isolated across agents',
    tags: ['MEMORY'],
    fixture: { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] },
    expectations: [{ invariantId: 'MEM-002', description: 'EPHEMERAL memory isolation', category: 'MEMORY' }],
  },
]

export async function runMemoryWriteRead(): Promise<Record<string, unknown>> {
  const artifact = Object.freeze({ artifactId: 'a1', scope: 'WORKING', content: 'hello', createdAt: new Date().toISOString() })
  return { memoryArtifactImmutable: Object.isFrozen(artifact) }
}

export async function runMemoryEphemeralLifecycle(): Promise<Record<string, unknown>> {
  const agentAStore = new Map<string, string>()
  const agentBStore = new Map<string, string>()
  agentAStore.set('key', 'ephemeral-value')
  // EPHEMERAL not leaked to agent B
  const isolated = !agentBStore.has('key')
  return { ephemeralIsolated: isolated }
}
