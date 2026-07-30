import type { ConformanceRule, ConformanceSubject, RuleResult, ConformanceIssue } from '../conformance-engine.js'

// metadata values must all be strings — no objects, arrays, numbers, or booleans.
// This ensures deterministic serialization and canonical ordering.

export function createDeterministicMetadataRule(): ConformanceRule {
  return {
    ruleId: '9k-deterministic-metadata',
    kind: 'static',
    description: 'metadata values are all strings (no objects/arrays)',
    async evaluate(subject: ConformanceSubject): Promise<RuleResult> {
      const p = subject.payload as Record<string, unknown>
      const issues: ConformanceIssue[] = []

      const metadata = p.metadata as Record<string, unknown> | undefined
      if (!metadata) {
        return { ruleId: '9k-deterministic-metadata', kind: 'static', outcome: 'passed', issues: [] }
      }

      for (const [key, value] of Object.entries(metadata)) {
        if (typeof value !== 'string') {
          issues.push({
            ruleId: '9k-deterministic-metadata',
            severity: 'error',
            code: 'conformance-failed',
            message: `metadata["${key}"] must be a string, got ${typeof value}`,
            path: `metadata.${key}`,
          })
        }
      }

      const outcome = issues.some(i => i.severity === 'error') ? 'failed' : 'passed'
      return { ruleId: '9k-deterministic-metadata', kind: 'static', outcome, issues }
    },
  }
}
