import type { IntentCandidate } from './intent-candidate.js'
import type { IntentConstraint } from '../types/intent-ir.js'

export class ConstraintResolver {
  resolve(candidate: IntentCandidate): readonly IntentConstraint[] {
    return (candidate.parsedConstraints ?? []).map(raw => ({
      type: this.normalizeType(raw.type),
      target: raw.target,
      ...(raw.value !== undefined && raw.value !== null ? { value: raw.value } : {}),
    }))
  }

  private normalizeType(raw?: string): IntentConstraint['type'] {
    const valid = ['preserve', 'exclude', 'require', 'prefer', 'limit'] as const
    if (raw && (valid as readonly string[]).includes(raw)) return raw as IntentConstraint['type']
    return 'require'
  }
}
