import type { AgentResult, ConsensusDecision, ConsensusStrategy, AgentDescriptor } from '@rohinik-org/compiler'
import { AgentRegistry } from '../registry/agent-registry.js'

export class ConsensusEngine {
  decide(
    results: readonly AgentResult[],
    strategy: ConsensusStrategy,
    registry: AgentRegistry,
  ): ConsensusDecision {
    const now = new Date().toISOString()
    if (results.length === 0) {
      return {
        decisionId: crypto.randomUUID(),
        strategy,
        selectedResultId: '',
        participatingAgentIds: [],
        votingRecord: {},
        decidedAt: now,
      }
    }
    const selectedResultId = this._select(results, strategy, registry)
    const votingRecord = this._vote(results, strategy, selectedResultId)
    return {
      decisionId: crypto.randomUUID(),
      strategy,
      selectedResultId,
      participatingAgentIds: results.map(r => r.agentId),
      votingRecord,
      decidedAt: now,
    }
  }

  private _select(results: readonly AgentResult[], strategy: ConsensusStrategy, registry: AgentRegistry): string {
    switch (strategy) {
      case 'MAJORITY': return this._majority(results)
      case 'WEIGHTED': return this._weighted(results, registry)
      case 'SUPERVISOR': return this._supervisor(results, registry)
      case 'UNANIMOUS': return this._unanimous(results)
    }
  }

  // resultId with most votes; ties → highest index (deterministic)
  private _majority(results: readonly AgentResult[]): string {
    const counts = new Map<string, number>()
    for (const r of results) counts.set(r.resultId, (counts.get(r.resultId) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0]
  }

  // weighted by avg confidence across profile capabilities
  private _weighted(results: readonly AgentResult[], registry: AgentRegistry): string {
    const scored = results.map(r => {
      const profile = registry.getProfileForAgent(r.agentId)
      const confs = profile ? Object.values(profile.confidence) : []
      const avg = confs.length ? confs.reduce((s, c) => s + c, 0) / confs.length : 0.5
      return { resultId: r.resultId, score: avg }
    }).sort((a, b) => b.score - a.score)
    return scored[0]!.resultId
  }

  // COORDINATOR role wins; fallback to MAJORITY
  private _supervisor(results: readonly AgentResult[], registry: AgentRegistry): string {
    const supervisorResult = results.find(r => registry.get(r.agentId)?.role === 'COORDINATOR')
    return supervisorResult ? supervisorResult.resultId : this._majority(results)
  }

  // UNANIMOUS: all must agree; if not, return first (DEFERRED status handled by policy engine)
  private _unanimous(results: readonly AgentResult[]): string {
    const ids = new Set(results.map(r => r.resultId))
    return ids.size === 1 ? results[0]!.resultId : results[0]!.resultId
  }

  private _vote(results: readonly AgentResult[], _strategy: ConsensusStrategy, _selected: string): Record<string, string> {
    return Object.fromEntries(results.map(r => [r.agentId, r.resultId]))
  }
}
