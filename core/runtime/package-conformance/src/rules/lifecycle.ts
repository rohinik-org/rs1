import type { ConformanceRule, ConformanceSubject, RuleResult, ConformanceIssue } from '../conformance-engine.js'
import type { LifecycleDeclaration } from '@rohinik-org/package-manifest-ir'

// L-9K-002: Packages must implement declared lifecycle hooks correctly.

export function createLifecycleRule(): ConformanceRule {
  return {
    ruleId: '9k-lifecycle-conformance',
    kind: 'static',
    description: 'L-9K-002: if lifecycle declared, gracefulShutdownTimeoutMs is a positive integer',
    async evaluate(subject: ConformanceSubject): Promise<RuleResult> {
      const p = subject.payload as Record<string, unknown>
      const issues: ConformanceIssue[] = []

      const lifecycle = p.lifecycle as LifecycleDeclaration | undefined
      if (!lifecycle) {
        return { ruleId: '9k-lifecycle-conformance', kind: 'static', outcome: 'passed', issues: [] }
      }

      if (
        lifecycle.gracefulShutdownTimeoutMs !== undefined &&
        (
          typeof lifecycle.gracefulShutdownTimeoutMs !== 'number' ||
          !Number.isInteger(lifecycle.gracefulShutdownTimeoutMs) ||
          lifecycle.gracefulShutdownTimeoutMs <= 0
        )
      ) {
        issues.push({
          ruleId: '9k-lifecycle-conformance',
          severity: 'error',
          code: 'conformance-failed',
          message: `lifecycle.gracefulShutdownTimeoutMs must be a positive integer, got ${String(lifecycle.gracefulShutdownTimeoutMs)}`,
          path: 'lifecycle.gracefulShutdownTimeoutMs',
        })
      }

      const outcome = issues.some(i => i.severity === 'error') ? 'failed' : 'passed'
      return { ruleId: '9k-lifecycle-conformance', kind: 'static', outcome, issues }
    },
  }
}
