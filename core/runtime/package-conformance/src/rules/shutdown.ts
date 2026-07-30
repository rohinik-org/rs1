import type { ConformanceRule, ConformanceSubject, RuleResult, ConformanceIssue } from '../conformance-engine.js'
import type { LifecycleDeclaration } from '@rohinik-org/package-manifest-ir'

export function createShutdownRule(): ConformanceRule {
  return {
    ruleId: '9k-shutdown-declaration',
    kind: 'static',
    description: 'if lifecycle.idempotentShutdown declared it is boolean',
    async evaluate(subject: ConformanceSubject): Promise<RuleResult> {
      const p = subject.payload as Record<string, unknown>
      const issues: ConformanceIssue[] = []

      const lifecycle = p.lifecycle as LifecycleDeclaration | undefined
      if (!lifecycle) {
        return { ruleId: '9k-shutdown-declaration', kind: 'static', outcome: 'passed', issues: [] }
      }

      if (
        lifecycle.idempotentShutdown !== undefined &&
        typeof lifecycle.idempotentShutdown !== 'boolean'
      ) {
        issues.push({
          ruleId: '9k-shutdown-declaration',
          severity: 'error',
          code: 'conformance-failed',
          message: `lifecycle.idempotentShutdown must be boolean, got ${typeof lifecycle.idempotentShutdown}`,
          path: 'lifecycle.idempotentShutdown',
        })
      }

      const outcome = issues.some(i => i.severity === 'error') ? 'failed' : 'passed'
      return { ruleId: '9k-shutdown-declaration', kind: 'static', outcome, issues }
    },
  }
}
