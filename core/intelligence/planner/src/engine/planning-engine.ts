import { createHash, randomUUID } from 'node:crypto'
import type {
  PlanningRequest,
  PlanningDecision,
  EvaluatedPlan,
  PlanningReason,
  PlanningExplanation,
  PlanningMetrics,
} from '@rohinik-org/planner-ir'
import { PlanningReason as PR } from '@rohinik-org/planner-ir'
import type { InstalledCapability } from '@rohinik-org/capability-registry'
import type { GoalResolver } from './goal-resolver.js'
import type { PlanGenerator } from './plan-generator.js'
import type { PlanOptimizer } from './plan-optimizer.js'
import type { PlanEvaluator } from './plan-evaluator.js'

const PLANNING_ALGORITHM_VERSION = 'planner-v1.0'

export interface PlanningRecord {
  readonly recordId: string
  readonly decisionId: string
  readonly requestId: string
  readonly policyId: string
  readonly selectedPlanId: string
  readonly selectedScore: number
  readonly selectionMargin: number
  readonly candidateCount: number
  readonly planningAlgorithmVersion: string
  readonly producedAt: Date
}

function capabilitySnapshotHash(caps: ReadonlyArray<InstalledCapability>): string {
  const sorted = [...caps].sort((a, b) => a.capabilityId.localeCompare(b.capabilityId))
  const data = sorted.map(c => `${c.capabilityId}@${c.version}`).join('|')
  return createHash('sha256').update(data).digest('hex').slice(0, 16)
}

export class PlanningEngine {
  constructor(
    private readonly goalResolver: GoalResolver,
    private readonly generator: PlanGenerator,
    private readonly optimizer: PlanOptimizer,
    private readonly evaluator: PlanEvaluator,
  ) {}

  async plan(request: PlanningRequest): Promise<PlanningDecision> {
    const startMs = Date.now()
    const { context, predictions, planningPolicy: policy } = request

    // Pipeline: GoalResolver → PlanGenerator → PlanOptimizer → PlanEvaluator
    const goals = this.goalResolver.resolve(context)
    const raw = this.generator.generate(goals, context, policy)
    const optimized = raw.map(c => this.optimizer.optimize(c))
    const evaluated = this.evaluator.evaluate(optimized, request)

    const planningDurationMs = Date.now() - startMs
    const candidateCount = evaluated.length

    // Build evaluations list — selected is index 0 after sort
    let selectedReason: PlanningReason = PR.NO_CANDIDATES
    const evaluations: EvaluatedPlan[] = []

    if (evaluated.length === 0) {
      // No-op — selectedReason stays NO_CANDIDATES
    } else if (evaluated.length === 1) {
      selectedReason = PR.ONLY_CANDIDATE
    } else {
      // Determine primary reason for selecting winner
      const winner = evaluated[0]!
      const runnerUp = evaluated[1]!
      if (winner.score - runnerUp.score > 0.3) {
        selectedReason = PR.HIGHER_CONFIDENCE
      } else if (policy.preferInstalledCapabilities &&
        context.installedCapabilities.some(ic => winner.executionPlan.steps.some(s => s.skillId === ic.capabilityId))) {
        selectedReason = PR.INSTALLED_CAPABILITY
      } else if (policy.preferLowerLatency && winner.estimatedLatencyMs < runnerUp.estimatedLatencyMs) {
        selectedReason = PR.LOWER_LATENCY
      } else if (policy.preferLowerCost && winner.estimatedCostUsd < runnerUp.estimatedCostUsd) {
        selectedReason = PR.LOWER_COST
      } else if (winner.predictedFailureProbability < runnerUp.predictedFailureProbability) {
        selectedReason = PR.LOWER_FAILURE_RISK
      } else {
        selectedReason = PR.MULTI_OBJECTIVE_BALANCE
      }
    }

    for (let i = 0; i < evaluated.length; i++) {
      const c = evaluated[i]!
      const isSelected = i === 0
      const base = {
        executionPlan: c.executionPlan,
        score: c.score,
        selected: isSelected,
        estimatedLatencyMs: c.estimatedLatencyMs,
        estimatedCostUsd: c.estimatedCostUsd,
        predictedFailureProbability: c.predictedFailureProbability,
      }
      evaluations.push(Object.freeze(
        isSelected
          ? base
          : { ...base, rejectionReason: deriveRejectionReason(c.score, evaluated[0]!, policy) }
      ))
    }

    const rejectedReasons = evaluated
      .slice(1)
      .map((c, i) => Object.freeze({
        candidateId: c.candidateId,
        reason: evaluations[i + 1]?.rejectionReason ?? PR.HIGHER_CONFIDENCE,
      }))

    const explanation: PlanningExplanation = Object.freeze({
      selectedReason,
      rejectedReasons: Object.freeze(rejectedReasons),
    })

    const selectedPlan = evaluations[0]?.executionPlan ?? emptyPlan(request.requestId)
    const selectedScore = evaluations[0]?.score ?? 0
    const selectionMargin = evaluated.length >= 2 ? (evaluated[0]!.score - evaluated[1]!.score) : 0
    const decisionConfidence = Math.min(1, selectedScore + selectionMargin * 0.5)

    const snapshotHash = capabilitySnapshotHash(context.installedCapabilities)
    const decisionId = createHash('sha256')
      .update([
        request.requestId,
        context.contextId,
        predictions.predictionId,
        policy.policyId,
        PLANNING_ALGORITHM_VERSION,
        snapshotHash,
      ].join('|'))
      .digest('hex')

    const metrics: PlanningMetrics = Object.freeze({
      planningDurationMs,
      candidateCount,
      decisionConfidence,
      selectionMargin,
      planningAlgorithmVersion: PLANNING_ALGORITHM_VERSION,
    })

    return Object.freeze({
      decisionId,
      requestId: request.requestId,
      evaluations: Object.freeze(evaluations),
      selectedPlan,
      selectedScore,
      explanation,
      metrics,
      producedAt: new Date(),
    })
  }

  buildRecord(decision: PlanningDecision, request: PlanningRequest): PlanningRecord {
    return Object.freeze({
      recordId: randomUUID(),
      decisionId: decision.decisionId,
      requestId: decision.requestId,
      policyId: request.planningPolicy.policyId,
      selectedPlanId: decision.selectedPlan.planId,
      selectedScore: decision.selectedScore,
      selectionMargin: decision.metrics.selectionMargin,
      candidateCount: decision.metrics.candidateCount,
      planningAlgorithmVersion: decision.metrics.planningAlgorithmVersion,
      producedAt: decision.producedAt,
    })
  }
}

function deriveRejectionReason(
  score: number,
  winner: { score: number; estimatedLatencyMs: number; estimatedCostUsd: number; predictedFailureProbability: number },
  policy: PlanningRequest['planningPolicy'],
): PlanningReason {
  if (score < winner.score * 0.5) return PR.LOWER_FAILURE_RISK
  if (policy.preferLowerLatency) return PR.LOWER_LATENCY
  if (policy.preferLowerCost) return PR.LOWER_COST
  return PR.HIGHER_CONFIDENCE
}

function emptyPlan(requestId: string) {
  return Object.freeze({
    planId: randomUUID(),
    requestId,
    steps: Object.freeze([]),
    budget: Object.freeze({
      maxRetries: 0,
      allowReasoning: false,
      allowNetwork: false,
      allowDisk: false,
      mode: 'BALANCED' as const,
    }),
    createdAt: new Date(),
  })
}
