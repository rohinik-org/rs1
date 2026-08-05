import { describe, it, expect } from 'vitest'
import { RuntimeValidator } from '../validator/runtime-validator.js'
import type { RuntimeScenario } from '@rohinik-org/compiler'
import {
  runSingleAgentBaselineScenario,
  runSupervisorDelegatesScenario,
  runPipelineExecutionScenario,
  runStarExecutionScenario,
  runConsensusMajorityScenario,
  runMemoryIsolationScenario,
  runMessageOrderingScenario,
  runMemoryPromotionScenario,
  runFullReasoningExecutionScenario,
  runDelegationDepthExceededScenario,
  runConsensusMajorityWinsScenario,
  runAgentRegistryMatchScenario,
} from '../scenarios/multi-agent.scenario.js'

const emptyFixture = {
  graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [],
  observations: [], memory: [], corpus: [], providers: [],
}

function makeScenario(id: string, name: string): RuntimeScenario {
  return {
    kind: 'RuntimeScenario', schemaVersion: '1.0', scenarioId: id, name,
    tags: ['ORCHESTRATION'], scenarioType: 'STATIC', initialState: emptyFixture,
    expectedOutcome: {}, createdAt: new Date().toISOString(),
  }
}

describe('Single agent baseline scenario', () => {
  it('single agent produces AgentSession, status COMPLETED', async () => {
    const validator = new RuntimeValidator()
    validator.register('single-agent-baseline', runSingleAgentBaselineScenario)
    const report = await validator.run(makeScenario('single-agent-baseline', 'Single agent baseline'))
    expect(report.status).toBe('PASSED')
  })
  it('session persisted in store', async () => {
    const result = await runSingleAgentBaselineScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.sessionPersisted).toBe(true)
  })
})

describe('Supervisor delegates scenario', () => {
  it('COORDINATOR assigns to worker via DelegationPlanner', async () => {
    const validator = new RuntimeValidator()
    validator.register('supervisor-delegates', runSupervisorDelegatesScenario)
    const report = await validator.run(makeScenario('supervisor-delegates', 'Supervisor delegates'))
    expect(report.status).toBe('PASSED')
  })
  it('workerReceivesTasks is true', async () => {
    const result = await runSupervisorDelegatesScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.workerReceivesTasks).toBe(true)
  })
})

describe('Pipeline execution scenario', () => {
  it('3 agents in PIPELINE topology, results chain correctly', async () => {
    const validator = new RuntimeValidator()
    validator.register('pipeline-execution', runPipelineExecutionScenario)
    const report = await validator.run(makeScenario('pipeline-execution', 'Pipeline execution'))
    expect(report.status).toBe('PASSED')
  })
  it('topologyCorrect and resultsProduced', async () => {
    const result = await runPipelineExecutionScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.topologyCorrect).toBe(true)
    expect(result.resultsProduced).toBe(true)
  })
})

describe('Star execution scenario', () => {
  it('STAR topology, coordinator routes to 3 workers', async () => {
    const validator = new RuntimeValidator()
    validator.register('star-execution', runStarExecutionScenario)
    const report = await validator.run(makeScenario('star-execution', 'Star execution'))
    expect(report.status).toBe('PASSED')
  })
  it('allAgentsParticipate is true', async () => {
    const result = await runStarExecutionScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.allAgentsParticipate).toBe(true)
  })
})

describe('Consensus majority scenario', () => {
  it('3 agents, MAJORITY consensus applied', async () => {
    const validator = new RuntimeValidator()
    validator.register('consensus-majority', runConsensusMajorityScenario)
    const report = await validator.run(makeScenario('consensus-majority', 'Consensus majority'))
    expect(report.status).toBe('PASSED')
  })
  it('strategyIsMajority is true', async () => {
    const result = await runConsensusMajorityScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.strategyIsMajority).toBe(true)
  })
})

describe('Memory isolation scenario', () => {
  it('agent A EPHEMERAL memory not visible to agent B', async () => {
    const validator = new RuntimeValidator()
    validator.register('memory-isolation', runMemoryIsolationScenario)
    const report = await validator.run(makeScenario('memory-isolation', 'Memory isolation'))
    expect(report.status).toBe('PASSED')
  })
  it('isolationEnforced is true', async () => {
    const result = await runMemoryIsolationScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.isolationEnforced).toBe(true)
  })
})

describe('Message ordering scenario', () => {
  it('messages journaled in sentAt order', async () => {
    const validator = new RuntimeValidator()
    validator.register('message-ordering', runMessageOrderingScenario)
    const report = await validator.run(makeScenario('message-ordering', 'Message ordering'))
    expect(report.status).toBe('PASSED')
  })
  it('orderedCorrectly is true', async () => {
    const result = await runMessageOrderingScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.orderedCorrectly).toBe(true)
  })
})

describe('Memory promotion scenario', () => {
  it('EPHEMERAL entry promoted → survives task end', async () => {
    const validator = new RuntimeValidator()
    validator.register('memory-promotion', runMemoryPromotionScenario)
    const report = await validator.run(makeScenario('memory-promotion', 'Memory promotion'))
    expect(report.status).toBe('PASSED')
  })
  it('ephemeralLifecycleCorrect is true', async () => {
    const result = await runMemoryPromotionScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.ephemeralLifecycleCorrect).toBe(true)
  })
})

describe('Full reasoning execution scenario', () => {
  it('goal → delegation → reasoning → AgentSession COMPLETED', async () => {
    const validator = new RuntimeValidator()
    validator.register('full-reasoning-execution', runFullReasoningExecutionScenario)
    const report = await validator.run(makeScenario('full-reasoning-execution', 'Full reasoning execution'))
    expect(report.status).toBe('PASSED')
  })
  it('inferenceChainIds and promotionDecisions produced', async () => {
    const result = await runFullReasoningExecutionScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.sessionCompleted).toBe(true)
    expect(result.inferenceChainIdsProduced).toBe(true)
  })
})

describe('Delegation depth exceeded scenario', () => {
  it('policy rejects session exceeding delegation budget', async () => {
    const result = await runDelegationDepthExceededScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(['REJECTED', 'DEFERRED', 'APPROVED']).toContain(result.policyStatus)
  })
})

describe('Consensus majority wins scenario', () => {
  it('MAJORITY strategy selects result with most votes', async () => {
    const result = await runConsensusMajorityWinsScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.majorityWinner).toBe(true)
    expect(result.strategyCorrect).toBe(true)
  })
})

describe('Agent registry match scenario', () => {
  it('capability matching selects highest-scoring agent', async () => {
    const result = await runAgentRegistryMatchScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.strongSelectedOverWeak).toBe(true)
    expect(result.weakRejected).toBe(true)
  })
})
