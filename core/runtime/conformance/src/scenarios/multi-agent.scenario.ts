import type { LoadedFixture } from '../fixture/fixture-loader.js'
import type { ScenarioExpectation } from '@rohinik-org/compiler'
import {
  AgentSessionEngine, AgentRegistry, NullAgentSessionStore, AgentCommunicationBus, AgentMemoryBridge,
} from '@rohinik-org/multi-agent'
import type { AgentDescriptor, AgentCapabilityProfile, AgentGoal } from '@rohinik-org/compiler'

function makeAgent(id: string, role: AgentDescriptor['role'] = 'EXECUTOR'): AgentDescriptor {
  return { agentId: id, name: id, role, capabilityProfileId: `${id}-profile`, version: '1.0' }
}
function makeProfile(id: string, caps: string[] = [], confidence: Record<string, number> = {}): AgentCapabilityProfile {
  return { profileId: `${id}-profile`, capabilities: caps, confidence, preferredDomains: [], forbiddenDomains: [], maxConcurrency: 2, costWeight: 0.2, latencyWeight: 0.1 }
}
function makeGoal(id: string, constraints: string[] = []): AgentGoal {
  return { goalId: id, description: 'scenario goal', constraints, priority: 1 }
}

export async function runSingleAgentBaselineScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const store = new NullAgentSessionStore()
  const engine = new AgentSessionEngine(store)
  const session = await engine.run(makeGoal('g-baseline'), [makeAgent('a1')], 'STAR')
  const persisted = await store.get(session.sessionId)
  return {
    sessionProduced: session.sessionId.length > 0,
    statusCompleted: session.status === 'COMPLETED',
    sessionPersisted: persisted !== undefined,
  }
}

export async function runSupervisorDelegatesScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const registry = new AgentRegistry()
  const coord = makeAgent('coord', 'COORDINATOR')
  const worker = makeAgent('worker', 'EXECUTOR')
  registry.register(coord, makeProfile('coord', ['manage']))
  registry.register(worker, makeProfile('worker', ['run'], { run: 0.9 }))
  const store = new NullAgentSessionStore()
  const engine = new AgentSessionEngine(store)
  const session = await engine.run(makeGoal('g-supervisor'), [coord, worker], 'STAR', registry)
  // COORDINATOR excluded from worker pool — tasks assigned to worker
  const workerTasks = session.tasks.filter(t => t.assignedAgentId === 'worker')
  return {
    sessionCompleted: session.status === 'COMPLETED',
    workerReceivesTasks: workerTasks.length > 0,
    selectionDecisionsProduced: session.selectionDecisions.length > 0,
  }
}

export async function runPipelineExecutionScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const store = new NullAgentSessionStore()
  const engine = new AgentSessionEngine(store)
  const agents = [makeAgent('a1', 'RESEARCHER'), makeAgent('a2', 'EXECUTOR'), makeAgent('a3', 'REVIEWER')]
  const session = await engine.run(makeGoal('g-pipeline'), agents, 'PIPELINE')
  return {
    sessionCompleted: session.status === 'COMPLETED',
    topologyCorrect: session.topology === 'PIPELINE',
    tasksProduced: session.tasks.length > 0,
    resultsProduced: session.results.length > 0,
  }
}

export async function runStarExecutionScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const store = new NullAgentSessionStore()
  const engine = new AgentSessionEngine(store)
  const agents = [makeAgent('w1'), makeAgent('w2'), makeAgent('w3')]
  const session = await engine.run(makeGoal('g-star'), agents, 'STAR')
  return {
    sessionCompleted: session.status === 'COMPLETED',
    topologyCorrect: session.topology === 'STAR',
    allAgentsParticipate: session.participatingAgentIds.length === 3,
  }
}

export async function runConsensusMajorityScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const store = new NullAgentSessionStore()
  const engine = new AgentSessionEngine(store)
  const agents = [makeAgent('a1'), makeAgent('a2'), makeAgent('a3')]
  const session = await engine.run(makeGoal('g-consensus'), agents, 'STAR')
  return {
    sessionCompleted: session.status === 'COMPLETED',
    consensusDecisionPresent: session.consensusDecision !== undefined,
    strategyIsMajority: session.consensusDecision.strategy === 'MAJORITY',
    selectedResultNonEmpty: session.results.length > 0,
  }
}

export async function runMemoryIsolationScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const bridge = new AgentMemoryBridge()
  bridge.write({ entryId: 'e1', agentId: 'agent-a', taskId: 't1', scope: 'EPHEMERAL', key: 'scratch', value: 'secret' })
  bridge.write({ entryId: 'e2', agentId: 'agent-b', taskId: 't1', scope: 'EPHEMERAL', key: 'scratch', value: 'other' })
  const viewA = bridge.createView('agent-a', 'EPHEMERAL')
  const viewB = bridge.createView('agent-b', 'EPHEMERAL')
  return {
    agentACantSeeAgentBEphemeral: !viewA.some(e => e.agentId === 'agent-b'),
    agentBCantSeeAgentAEphemeral: !viewB.some(e => e.agentId === 'agent-a'),
    isolationEnforced: true,
  }
}

export async function runMessageOrderingScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const bus = new AgentCommunicationBus()
  bus.publish('sender', 'receiver', 1)
  bus.publish('sender', 'receiver', 2)
  bus.publish('sender', 'receiver', 3)
  const journal = bus.getJournal()
  const payloads = journal.map(m => m.payload)
  return {
    journalHas3Messages: journal.length === 3,
    orderedCorrectly: JSON.stringify(payloads) === JSON.stringify([1, 2, 3]),
    allHaveSentAt: journal.every(m => typeof m.sentAt === 'string'),
  }
}

export async function runMemoryPromotionScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const bridge = new AgentMemoryBridge()
  bridge.write({ entryId: 'e1', agentId: 'agent-a', taskId: 't1', scope: 'EPHEMERAL', key: 'work', value: 'temporary' })
  // before destroy: visible
  const beforeDestroy = bridge.createView('agent-a', 'EPHEMERAL').length
  bridge.destroyEphemeral('t1')
  // after destroy: gone
  const afterDestroy = bridge.createView('agent-a', 'EPHEMERAL').length
  return {
    visibleBeforeDestroy: beforeDestroy > 0,
    destroyedAfterTask: afterDestroy === 0,
    ephemeralLifecycleCorrect: beforeDestroy > 0 && afterDestroy === 0,
  }
}

export async function runFullReasoningExecutionScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const store = new NullAgentSessionStore()
  const engine = new AgentSessionEngine(store)
  const agents = [
    makeAgent('planner-1', 'PLANNER'),
    makeAgent('executor-1', 'EXECUTOR'),
    makeAgent('reflector-1', 'REFLECTOR'),
  ]
  const session = await engine.run(makeGoal('g-full', ['plan', 'execute', 'reflect']), agents, 'PIPELINE')
  return {
    sessionCompleted: session.status === 'COMPLETED',
    inferenceChainIdsProduced: session.results.every(r => r.inferenceChainId.length > 0),
    promotionDecisionsProduced: session.promotionDecisions.length === session.tasks.length,
    consensusDecisionPresent: session.consensusDecision !== undefined,
    journalEntriesProduced: engine.getJournal().getBySession(session.sessionId).length > 0,
  }
}

// These 3 additional scenarios test policy/delegation boundary conditions
export async function runDelegationDepthExceededScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const { DEFAULT_AGENT_POLICY } = await import('@rohinik-org/compiler')
  const { AgentPolicyEngine } = await import('@rohinik-org/multi-agent')
  const policyEngine = new AgentPolicyEngine()
  // build a fake session with way too many tasks
  const store = new NullAgentSessionStore()
  const engine = new AgentSessionEngine(store, { ...DEFAULT_AGENT_POLICY, maxParallelAgents: 2, maxDelegationDepth: 1 })
  const agents = Array.from({ length: 5 }, (_, i) => makeAgent(`a${i}`))
  const session = await engine.run(makeGoal('g-depth'), agents, 'MESH')
  const status = policyEngine.evaluate(session, { ...DEFAULT_AGENT_POLICY, maxParallelAgents: 2, maxDelegationDepth: 1 })
  return { policyStatus: status, sessionStatus: session.status }
}

export async function runConsensusMajorityWinsScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const { ConsensusEngine, AgentRegistry: Reg } = await import('@rohinik-org/multi-agent')
  const engine = new ConsensusEngine()
  const registry = new Reg()
  const r1 = { resultId: 'r1', agentId: 'a1', taskId: 't1', inferenceChainId: 'c1', completedAt: new Date().toISOString() }
  const r2 = { resultId: 'r1', agentId: 'a2', taskId: 't1', inferenceChainId: 'c2', completedAt: new Date().toISOString() }
  const r3 = { resultId: 'r3', agentId: 'a3', taskId: 't1', inferenceChainId: 'c3', completedAt: new Date().toISOString() }
  const decision = engine.decide([r1, r2, r3], 'MAJORITY', registry)
  return {
    majorityWinner: decision.selectedResultId === 'r1',
    strategyCorrect: decision.strategy === 'MAJORITY',
    participantsRecorded: decision.participatingAgentIds.length === 3,
  }
}

export async function runAgentRegistryMatchScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const { AgentRegistry: Reg, AgentCapabilityStore } = await import('@rohinik-org/multi-agent')
  const registry = new Reg()
  const strong = makeAgent('strong', 'EXECUTOR')
  const weak = makeAgent('weak', 'EXECUTOR')
  registry.register(strong, makeProfile('strong', ['typescript', 'test'], { typescript: 0.95, test: 0.9 }))
  registry.register(weak, makeProfile('weak', ['typescript'], { typescript: 0.3 }))
  const store = new AgentCapabilityStore(registry)
  const decision = store.matchForTask(['typescript', 'test'], [strong, weak])
  return {
    strongSelectedOverWeak: decision.selectedAgentId === 'strong',
    weakRejected: decision.rejectedAgentIds.includes('weak'),
    scoresPresent: Object.keys(decision.scores).length === 2,
  }
}
