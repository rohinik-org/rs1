import type { DecisionTrace, DecisionEvent } from './domain/trace.js'

export function buildExplanation(trace: DecisionTrace): string {
  const parts: string[] = []

  if (!trace.winnerSkillId || !trace.winnerTierId) {
    const rejections = trace.events.filter(e => e.type === 'SKILL_REJECTED')
    parts.push(`No skill matched any tier.`)
    if (rejections.length > 0) {
      parts.push(`${rejections.length} skill(s) rejected.`)
    }
    return parts.join(' ')
  }

  const selectedEvent = trace.events.find(
    (e): e is Extract<DecisionEvent, { type: 'SKILL_SELECTED' }> =>
      e.type === 'SKILL_SELECTED' && e.skillId === trace.winnerSkillId
  )

  const scoreStr = selectedEvent ? ` (score: ${selectedEvent.score.finalScore.toFixed(2)})` : ''
  parts.push(`${trace.winnerSkillId}${scoreStr} selected via ${trace.winnerTierId} tier.`)

  const rejections = trace.events.filter(e => e.type === 'SKILL_REJECTED')
  if (rejections.length > 0) {
    parts.push(`${rejections.length} skill(s) rejected.`)
  }

  if (trace.reasoningInvoked) {
    parts.push('Reasoning engine invoked.')
  } else {
    parts.push('Reasoning skipped.')
  }

  const executionEvent = trace.events.find(
    (e): e is Extract<DecisionEvent, { type: 'EXECUTION_SUCCEEDED' }> =>
      e.type === 'EXECUTION_SUCCEEDED'
  )
  if (executionEvent) {
    parts.push(`Execution: ${executionEvent.durationMs}ms.`)
  }

  return parts.join(' ')
}
