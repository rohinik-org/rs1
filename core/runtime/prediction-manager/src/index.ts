import { createHash, randomUUID } from 'node:crypto'
import { ContextRanker } from '@rohinik-org/context-manager'
import type { WorkingContextIR } from '@rohinik-org/prediction-ir'
import type {
  PredictionBundle,
  PredictionPolicyIR,
  PredictionRequest,
  IntentPrediction,
  CapabilityPrediction,
  BudgetPrediction,
  FailurePrediction,
  MemoryPrediction,
  WorkflowPrediction,
} from '@rohinik-org/prediction-ir'
import { DEFAULT_PREDICTION_POLICY } from '@rohinik-org/prediction-ir'

export type {
  PredictionBundle,
  PredictionPolicyIR,
  PredictionRequest,
  IntentPrediction,
  CapabilityPrediction,
  BudgetPrediction,
  FailurePrediction,
  MemoryPrediction,
  WorkflowPrediction,
}
export { DEFAULT_PREDICTION_POLICY }

// ─── Plugin interface ─────────────────────────────────────────────────────────

export interface MutablePredictionContext {
  intentPrediction?: IntentPrediction
  capabilityPrediction?: CapabilityPrediction
  budgetPrediction?: BudgetPrediction
  failurePrediction?: FailurePrediction
  memoryPrediction?: MemoryPrediction
  workflowPrediction?: WorkflowPrediction
  contributorIds: string[]
}

export interface PredictionContributor {
  readonly contributorId: string
  readonly priority: number
  contribute(request: PredictionRequest, ctx: MutablePredictionContext): Promise<void>
}

// ─── Built-in rules contributor (Law 38: deterministic fallback) ──────────────

export class RulesPredictionContributor implements PredictionContributor {
  readonly contributorId = 'rules'
  readonly priority = 10
  private readonly ranker = new ContextRanker()

  async contribute(request: PredictionRequest, ctx: MutablePredictionContext): Promise<void> {
    const { workingContext, policy } = request
    const terms = [...workingContext.intent.concepts, ...workingContext.intent.preferredSkills]

    // capabilityPrediction: rank installed caps by term overlap
    const rankedCaps = this.ranker.rankCapabilities(workingContext.installedCapabilities, terms)
    ctx.capabilityPrediction = Object.freeze({
      ranked: Object.freeze(rankedCaps.map(c => ({
        capabilityId: c.capabilityId,
        confidence: Math.max(this.ranker.scoreCapability(c, terms), 0.1),
      }))),
    })

    // intentPrediction: top concept as predicted intent label
    const topConcept = terms[0] ?? 'unknown'
    ctx.intentPrediction = Object.freeze({
      predictedIntent: topConcept,
      confidence: terms.length > 0 ? 0.6 : 0.1,
      alternatives: Object.freeze(terms.slice(1).map((t, i) => ({ intent: t, confidence: 0.4 - i * 0.05 }))),
    })

    // budgetPrediction: static estimate from policy budget
    const maxTokens = workingContext.tokenBudget.maxTokenBudget
    ctx.budgetPrediction = Object.freeze({
      estimatedLatencyMs: policy.maxLatencyMs,
      estimatedTokens: Math.round(maxTokens * 0.4),
      estimatedCostUsd: Math.round(maxTokens * 0.4) * 0.000002,
    })

    // failurePrediction: no matching caps → high failure probability
    const hasMatch = rankedCaps.some(c => this.ranker.scoreCapability(c, terms) > 0)
    ctx.failurePrediction = Object.freeze({
      failureProbability: hasMatch ? 0.05 : 0.7,
      confidence: 0.8,
      reasons: Object.freeze(hasMatch ? [] : ['no capabilities matched intent terms']),
    })

    // memoryPrediction: fragment count ≥ 3 → high importance
    const fragmentCount = workingContext.knowledgeFragments.length
    ctx.memoryPrediction = Object.freeze({
      importanceScore: fragmentCount >= 3 ? 0.85 : fragmentCount >= 1 ? 0.5 : 0.15,
      confidence: 0.7,
    })

    // workflowPrediction: skill sequences from knowledge procedures
    const steps = workingContext.knowledgeFragments.flatMap(f =>
      f.procedures.flatMap(p => p.steps ?? [])
    )
    ctx.workflowPrediction = Object.freeze({
      likelyNextSteps: Object.freeze(steps.slice(0, 5).map((s, i) => ({
        skillId: typeof s === 'string' ? s : String(s),
        confidence: Math.max(0.9 - i * 0.1, 0.1),
      }))),
    })
  }
}

// ─── PredictionManager ────────────────────────────────────────────────────────

export class PredictionManager {
  private readonly contributors: PredictionContributor[] = []

  withContributor(c: PredictionContributor): this {
    this.contributors.push(c)
    return this
  }

  async predict(workingContext: WorkingContextIR, policy?: PredictionPolicyIR): Promise<PredictionBundle>
  async predict(request: PredictionRequest): Promise<PredictionBundle>
  async predict(
    workingContextOrRequest: WorkingContextIR | PredictionRequest,
    policy?: PredictionPolicyIR,
  ): Promise<PredictionBundle> {
    const req: PredictionRequest = 'predictionId' in workingContextOrRequest
      ? workingContextOrRequest
      : {
          predictionId: randomUUID(),
          workingContext: workingContextOrRequest,
          policy: policy ?? DEFAULT_PREDICTION_POLICY,
        }

    const mutable: MutablePredictionContext = { contributorIds: [] }

    const sorted = [...this.contributors].sort((a, b) => a.priority - b.priority)
    for (const contributor of sorted) {
      await contributor.contribute(req, mutable)
      mutable.contributorIds.push(contributor.contributorId)
    }

    const predictionId = createHash('sha256')
      .update(JSON.stringify({ workingContextId: req.workingContext.contextId, policyId: req.policy.policyId }))
      .digest('hex')

    return Object.freeze({
      predictionId,
      workingContextId: req.workingContext.contextId,
      intentPrediction: mutable.intentPrediction,
      capabilityPrediction: mutable.capabilityPrediction,
      budgetPrediction: mutable.budgetPrediction,
      failurePrediction: mutable.failurePrediction,
      memoryPrediction: mutable.memoryPrediction,
      workflowPrediction: mutable.workflowPrediction,
      producedAt: new Date(),
      contributors: Object.freeze([...mutable.contributorIds]),
    })
  }
}
