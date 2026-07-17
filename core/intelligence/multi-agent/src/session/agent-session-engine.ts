import type { AgentGoal, AgentDescriptor, AgentTopology, AgentSession, AgentPolicy } from '@rohinik-org/compiler'
import { DEFAULT_AGENT_POLICY } from '@rohinik-org/compiler'
import type { AgentSessionStore } from '../store/agent-session-store.js'
import { AgentRegistry } from '../registry/agent-registry.js'
import { AgentCoordinator } from '../coordinator/delegation-planner.js'
import { AgentScheduler } from '../scheduler/agent-scheduler.js'
import { AgentRuntime } from '../runtime/agent-runtime.js'
import { ConsensusEngine } from '../consensus/consensus-engine.js'
import { ResultMerger } from '../consensus/result-merger.js'
import { MemoryPromotionEngine } from '../promotion/memory-promotion-engine.js'
import { AgentPolicyEngine } from '../policy/agent-policy-engine.js'
import { AgentJournal } from './agent-journal.js'

export class AgentSessionEngine {
  private readonly journal = new AgentJournal()
  private readonly scheduler = new AgentScheduler()
  private readonly consensus = new ConsensusEngine()
  private readonly merger = new ResultMerger()
  private readonly promotionEngine = new MemoryPromotionEngine()
  private readonly policyEngine = new AgentPolicyEngine()

  constructor(
    private readonly store: AgentSessionStore,
    private readonly policy: AgentPolicy = DEFAULT_AGENT_POLICY,
  ) {}

  async run(
    goal: AgentGoal,
    agents: readonly AgentDescriptor[],
    topology: AgentTopology,
    registry?: AgentRegistry,
  ): Promise<AgentSession> {
    const sessionId = crypto.randomUUID()
    const startedAt = new Date().toISOString()

    try {
      this.journal.append(sessionId, 'GOAL_RECEIVED', undefined, { goalId: goal.goalId })

      // use provided registry or build one from agents with empty profiles
      const reg = registry ?? buildRegistry(agents)
      const coordinator = new AgentCoordinator(reg)

      const plan = coordinator.coordinate(goal, agents, topology)
      const schedule = this.scheduler.schedule(plan.tasks, 'parallel')

      const runtime = new AgentRuntime(this.journal)
      const results = await Promise.all(
        plan.tasks.map(task => runtime.execute(task, sessionId))
      )

      const consensusDecision = this.consensus.decide(results, this.policy.consensusStrategy, reg)
      this.journal.append(sessionId, 'CONSENSUS_REACHED', undefined, { selectedResultId: consensusDecision.selectedResultId })

      const composite = this.merger.merge(results, consensusDecision)
      const promotionDecisions = this.promotionEngine.evaluate(results, plan.tasks)

      const status = results.length > 0
        ? (results.length === plan.tasks.length ? 'COMPLETED' : 'PARTIAL')
        : (agents.length === 0 ? 'COMPLETED' : 'PARTIAL')

      const session: AgentSession = {
        sessionId,
        goalId: goal.goalId,
        topology,
        participatingAgentIds: agents.map(a => a.agentId),
        tasks: plan.tasks,
        results,
        selectionDecisions: plan.selectionDecisions,
        consensusDecision,
        promotionDecisions,
        status,
        startedAt,
        completedAt: new Date().toISOString(),
      }

      await this.store.save(session)
      this.journal.append(sessionId, 'SESSION_COMPLETED', undefined, { status })
      return session
    } catch (err) {
      const failed: AgentSession = {
        sessionId,
        goalId: goal.goalId,
        topology,
        participatingAgentIds: agents.map(a => a.agentId),
        tasks: [],
        results: [],
        selectionDecisions: [],
        consensusDecision: {
          decisionId: `cd-err-${sessionId}`,
          strategy: this.policy.consensusStrategy,
          selectedResultId: '',
          participatingAgentIds: [],
          votingRecord: {},
          decidedAt: new Date().toISOString(),
        },
        promotionDecisions: [],
        status: 'FAILED',
        startedAt,
        completedAt: new Date().toISOString(),
      }
      await this.store.save(failed)
      return failed
    }
  }

  getJournal(): AgentJournal { return this.journal }
}

function buildRegistry(agents: readonly AgentDescriptor[]): AgentRegistry {
  const reg = new AgentRegistry()
  for (const a of agents) {
    reg.register(a, {
      profileId: a.capabilityProfileId,
      capabilities: [],
      confidence: {},
      preferredDomains: [],
      forbiddenDomains: [],
      maxConcurrency: 2,
      costWeight: 0.2,
      latencyWeight: 0.1,
    })
  }
  return reg
}
