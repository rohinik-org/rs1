import {
  BudgetStatus,
  CONTEXT_PROTOCOL_OVERHEAD_TOKENS,
  CONTEXT_SAFETY_MARGIN_TOKENS,
} from '@rohinik-org/context-quality-ir'
import type {
  ContextBudget,
  ContextPackage,
  ConsumerContextProfile,
  BudgetGovernorResult,
} from '@rohinik-org/context-quality-ir'

const SUPPORTED_UNITS = new Set(['token', 'item'])

export class BudgetGovernor {
  assess(
    pkg:      ContextPackage,
    budget:   ContextBudget,
    consumer: ConsumerContextProfile,
  ): BudgetGovernorResult {
    const sourceCount = new Set(pkg.items.map(item => item.provenance.sourceId)).size

    if (!SUPPORTED_UNITS.has(consumer.contextUnit)) {
      return {
        status: BudgetStatus.CONSUMER_UNIT_UNSUPPORTED,
        totalEstimatedTokens: 0,
        effectiveBudget: 0,
        overageTokens: 0,
        sourceCount,
      }
    }

    if (consumer.contextUnit === 'item') {
      const over = pkg.items.length > consumer.maximumContextUnits
      return {
        status: over ? BudgetStatus.HARD_LIMIT_EXCEEDED : BudgetStatus.WITHIN_BUDGET,
        totalEstimatedTokens: pkg.items.reduce((s, i) => s + i.estimatedTokens, 0),
        effectiveBudget: consumer.maximumContextUnits,
        overageTokens: Math.max(0, pkg.items.length - consumer.maximumContextUnits),
        sourceCount,
      }
    }

    const contractLimit   = budget.maximumInputTokens
    const consumerLimit   = consumer.maximumContextUnits
    const effectiveBudget =
      Math.min(contractLimit, consumerLimit)
      - budget.reservedOutputTokens
      - CONTEXT_PROTOCOL_OVERHEAD_TOKENS
      - CONTEXT_SAFETY_MARGIN_TOKENS

    const totalEstimatedTokens = pkg.items.reduce((sum, item) => sum + item.estimatedTokens, 0)

    if (budget.maximumItems !== undefined && pkg.items.length > budget.maximumItems) {
      return { status: BudgetStatus.HARD_LIMIT_EXCEEDED, totalEstimatedTokens, effectiveBudget, overageTokens: 0, sourceCount }
    }

    if (budget.maximumSources !== undefined && sourceCount > budget.maximumSources) {
      return { status: BudgetStatus.HARD_LIMIT_EXCEEDED, totalEstimatedTokens, effectiveBudget, overageTokens: 0, sourceCount }
    }

    const overageTokens = Math.max(0, totalEstimatedTokens - effectiveBudget)
    if (overageTokens > 0) {
      return { status: BudgetStatus.HARD_LIMIT_EXCEEDED, totalEstimatedTokens, effectiveBudget, overageTokens, sourceCount }
    }

    const softRatio = budget.softLimitRatio ?? 1.0
    if (totalEstimatedTokens > effectiveBudget * softRatio) {
      return { status: BudgetStatus.SOFT_LIMIT_EXCEEDED, totalEstimatedTokens, effectiveBudget, overageTokens: 0, sourceCount }
    }

    return { status: BudgetStatus.WITHIN_BUDGET, totalEstimatedTokens, effectiveBudget, overageTokens: 0, sourceCount }
  }
}
