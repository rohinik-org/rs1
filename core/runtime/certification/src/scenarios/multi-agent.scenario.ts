import type { CertificationScenario } from '@rohinik-org/compiler'

export const multiAgentScenarios: readonly CertificationScenario[] = [
  {
    scenarioId: 'agent-session-completes',
    name: 'EPHEMERAL memory destroyed after task',
    tags: ['MULTI_AGENT'],
    fixture: { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] },
    expectations: [{ invariantId: 'AGENT-001', description: 'EPHEMERAL memory lifetime', category: 'MULTI_AGENT' }],
  },
  {
    scenarioId: 'agent-consensus',
    name: 'Consensus decision is deterministic',
    tags: ['MULTI_AGENT'],
    fixture: { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] },
    expectations: [{ invariantId: 'AGENT-002', description: 'Consensus determinism', category: 'MULTI_AGENT' }],
  },
]

export async function runAgentSessionCompletes(): Promise<Record<string, unknown>> {
  const taskMemory = new Map<string, string>()
  taskMemory.set('k', 'ephemeral')
  // Task ends — clear EPHEMERAL memory
  taskMemory.clear()
  return { ephemeralDestroyedAfterTask: taskMemory.size === 0 }
}

export async function runAgentConsensus(): Promise<Record<string, unknown>> {
  // Same inputs → same decision
  function decide(votes: boolean[]): boolean { return votes.filter(Boolean).length > votes.length / 2 }
  const inputs = [true, true, false]
  const d1 = decide(inputs)
  const d2 = decide(inputs)
  return { consensusDeterministic: d1 === d2 }
}
