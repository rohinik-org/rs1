import { randomUUID } from 'node:crypto'
import type { WorkingContextIR } from '@rohinik-org/working-context'
import type { Goal, PlanningPolicyIR, ExecutionBudget } from '@rohinik-org/planner-ir'

// ponytail: local structural aliases break the kernel→foundation→planner→kernel cycle; cast sites already use `as unknown as`
type ExecutionStep = { readonly skillId: string; readonly tierId: string; readonly [k: string]: unknown }
type ExecutionPlan = { readonly planId: string; readonly requestId: string; readonly steps: readonly ExecutionStep[]; readonly budget: ExecutionBudget; readonly createdAt: Date }

// Internal to @rohinik-org/planner — never exported
export interface PlanCandidate {
  readonly candidateId: string
  readonly executionPlan: ExecutionPlan
  readonly score: number
  readonly estimatedLatencyMs: number
  readonly estimatedCostUsd: number
  readonly predictedFailureProbability: number
}

export class PlanGenerator {
  generate(
    goals: ReadonlyArray<Goal>,
    context: WorkingContextIR,
    policy: PlanningPolicyIR,
  ): ReadonlyArray<PlanCandidate> {
    if (goals.length === 0) return Object.freeze([])

    // Sort caps by capabilityId ASC for deterministic ordering (Law 43)
    const caps = [...context.installedCapabilities].sort((a, b) =>
      a.capabilityId.localeCompare(b.capabilityId)
    )

    const candidates: PlanCandidate[] = []

    // One candidate per viable cap that matches at least one goal skillId
    for (const cap of caps) {
      const matchedGoals = goals.filter(g =>
        g.skillId.toLowerCase() === cap.capabilityId.toLowerCase() ||
        cap.manifest.tags?.some((t: string) => t.toLowerCase() === g.skillId.toLowerCase())
      )
      if (matchedGoals.length === 0) continue

      const steps: ExecutionStep[] = matchedGoals.map((g, i) => ({
        stepId: `${cap.capabilityId}-step-${i}`,
        skillId: g.skillId,
        tierId: 'LOCAL' as const,
        inputs: [],
        executionPolicy: 'BEST_SCORE' as const,
        timeoutMs: 5000,
        retryPolicy: { maxAttempts: 1, retryableStatuses: [] },
        resolvedProviders: {},
        estimatedCost: { tokens: 0, costUsd: 0, latencyMs: 50 },
        score: { relevance: 1, confidence: 1, quality: 1, combined: 1 },
        dependsOn: i > 0 ? [`${cap.capabilityId}-step-${i - 1}`] : [],
        constraints: {},
      }) as unknown as ExecutionStep)

      // candidateId: deterministic string from capabilityId + matched skillIds (Law 43)
      const candidateId = `${cap.capabilityId}::${matchedGoals.map(g => g.skillId).join(',')}`

      candidates.push(Object.freeze({
        candidateId,
        executionPlan: Object.freeze({
          planId: randomUUID(),
          requestId: context.requestId,
          steps: Object.freeze(steps),
          budget: Object.freeze({
            maxRetries: 3,
            allowReasoning: true,
            allowNetwork: false,
            allowDisk: false,
            mode: 'BALANCED' as const,
          }),
          createdAt: new Date(),
        }),
        score: 0,  // PlanGenerator never scores — PlanEvaluator does
        estimatedLatencyMs: 50 * matchedGoals.length,
        estimatedCostUsd: 0,
        predictedFailureProbability: 0,
      }))
    }

    // If no installed cap matches and acquisition allowed, emit one acquisition candidate
    if (candidates.length === 0 && policy.allowCapabilityAcquisition) {
      const primaryGoal = goals[0]!
      candidates.push(Object.freeze({
        candidateId: `acquire::${primaryGoal.skillId}`,
        executionPlan: Object.freeze({
          planId: randomUUID(),
          requestId: context.requestId,
          steps: Object.freeze([{
            stepId: 'acquire-step-0',
            skillId: primaryGoal.skillId,
            tierId: 'LOCAL' as const,
            inputs: [],
            executionPolicy: 'BEST_SCORE' as const,
            timeoutMs: 30000,
            retryPolicy: { maxAttempts: 1, retryableStatuses: [] },
            resolvedProviders: {},
            estimatedCost: { tokens: 0, costUsd: 0, latencyMs: 500 },
            score: { relevance: 0.5, confidence: 0.5, quality: 0.5, combined: 0.5 },
            dependsOn: [],
            constraints: {},
          } as unknown as ExecutionStep]),
          budget: Object.freeze({
            maxRetries: 1,
            allowReasoning: false,
            allowNetwork: true,
            allowDisk: true,
            mode: 'BALANCED' as const,
          }),
          createdAt: new Date(),
        }),
        score: 0,
        estimatedLatencyMs: 500,
        estimatedCostUsd: 0,
        predictedFailureProbability: 0.4,
      }))
    }

    return Object.freeze(candidates)
  }
}
