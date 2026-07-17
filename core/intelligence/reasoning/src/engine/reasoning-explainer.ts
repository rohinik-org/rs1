import type { ReasoningReport } from '@rohinik-org/compiler'

export class ReasoningExplainer {
  explain(report: ReasoningReport): string {
    if (report.status === 'REJECTED' || report.hypothesisSet.length === 0) {
      return `Reasoning: no hypotheses generated (status: ${report.status}).`
    }
    const top = report.hypothesisSet[0]!
    const rec = report.recommendationSet[0]
    const recLine = rec ? ` Recommended action: ${rec.action} (${rec.priority} priority).` : ''
    return `Hypothesis [${top.category}] confidence=${top.confidence.toFixed(2)}: ${top.statement}.${recLine} Status: ${report.status}.`
  }
}
