import { randomUUID, createHash } from 'node:crypto'
import type { ExecutionChain, WorkflowCandidate, WorkflowCandidateSet, WorkflowStep, WorkflowEvidence } from '@rohinik-org/compiler'
import type { ExecutionChainExtractor } from './chain-extractor.js'
import type { WorkflowConfidenceStrategy } from '../scoring/workflow-confidence-strategy.js'

export interface DiscoveryOptions {
  readonly minSupport?: number
  readonly minConfidence?: number
  readonly maxChainLength?: number
}

// ponytail: minConfidence defaults to 0 so engine doesn't double-filter;
// callers (AutoApprovalPolicy) apply their own threshold
const DEFAULTS = { minSupport: 3, minConfidence: 0, maxChainLength: 4 }

function candidateId(steps: readonly WorkflowStep[]): string {
  return createHash('sha256')
    .update(JSON.stringify(steps.map(s => ({ skillId: s.skillId, position: s.position }))))
    .digest('hex')
}

export class WorkflowDiscoveryEngine {
  constructor(
    private readonly extractor: ExecutionChainExtractor,
    private readonly confidenceStrategy: WorkflowConfidenceStrategy,
  ) {}

  async discover(chains: readonly ExecutionChain[], opts: DiscoveryOptions): Promise<WorkflowCandidateSet> {
    const { minSupport, minConfidence, maxChainLength } = { ...DEFAULTS, ...opts }
    const now = new Date().toISOString()

    const earliest = chains.length > 0 ? chains.reduce((min, c) => c.startedAt < min ? c.startedAt : min, chains[0]!.startedAt) : now
    const recordsScanned = chains.reduce((s, c) => s + c.records.length, 0)

    const groups = new Map<string, {
      steps: WorkflowStep[]
      sessions: Set<string>
      successCount: number
      failCount: number
      totalLatency: number
    }>()

    for (const chain of chains) {
      for (const seq of this.extractor.extract(chain, maxChainLength)) {
        const id = candidateId(seq)
        if (!groups.has(id)) {
          groups.set(id, { steps: [...seq], sessions: new Set(), successCount: 0, failCount: 0, totalLatency: 0 })
        }
        const g = groups.get(id)!
        g.sessions.add(chain.chainId)
        for (const step of seq) {
          for (const [outcome, count] of Object.entries(step.statistics.outcomeDistribution)) {
            if (outcome === 'SUCCESS') g.successCount += count
            else g.failCount += count
          }
          g.totalLatency += step.statistics.averageLatencyMs
        }
      }
    }

    const candidates: WorkflowCandidate[] = []
    for (const [id, g] of groups) {
      if (g.sessions.size < minSupport) continue

      const evidence: WorkflowEvidence = {
        executionCount: g.successCount + g.failCount,
        successfulExecutions: g.successCount,
        failedExecutions: g.failCount,
        uniqueSessions: g.sessions.size,
      }
      const confidence = this.confidenceStrategy.score(evidence)
      if (confidence < minConfidence) continue

      const successRate = evidence.executionCount > 0 ? evidence.successfulExecutions / evidence.executionCount : 0
      const occurrences = g.steps.length > 0 ? evidence.executionCount / g.steps.length : 0
      const avgLatency = occurrences > 0 ? g.totalLatency / occurrences : 0

      candidates.push({
        definition: { candidateId: id, steps: g.steps },
        statistics: { confidence, successRate, averageLatencyMs: avgLatency },
        evidence,
      })
    }

    return {
      kind: 'WorkflowCandidateSet',
      schemaVersion: '1.0',
      candidateSetId: randomUUID(),
      producedAt: now,
      generatedBy: 'WorkflowDiscoveryEngine',
      corpusWindow: { start: earliest, end: now },
      recordsScanned,
      chainsGenerated: chains.length,
      candidates,
    }
  }
}
