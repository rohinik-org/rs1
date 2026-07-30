import type { ConformanceRule, ConformanceSubject, RuleResult, ConformanceIssue } from '../conformance-engine.js'
import type { HealthDeclaration } from '@rohinik-org/package-manifest-ir'

export function createReadinessRule(): ConformanceRule {
  return {
    ruleId: '9k-readiness-declaration',
    kind: 'static',
    description: 'if health.readiness declared it is a non-empty string path',
    async evaluate(subject: ConformanceSubject): Promise<RuleResult> {
      const p = subject.payload as Record<string, unknown>
      const issues: ConformanceIssue[] = []

      const health = p.health as HealthDeclaration | undefined
      if (!health) {
        return { ruleId: '9k-readiness-declaration', kind: 'static', outcome: 'passed', issues: [] }
      }

      if (health.readiness !== undefined) {
        if (typeof health.readiness !== 'string' || health.readiness.trim() === '') {
          issues.push({
            ruleId: '9k-readiness-declaration',
            severity: 'error',
            code: 'conformance-failed',
            message: 'health.readiness must be a non-empty string path',
            path: 'health.readiness',
          })
        }
      }

      const outcome = issues.some(i => i.severity === 'error') ? 'failed' : 'passed'
      return { ruleId: '9k-readiness-declaration', kind: 'static', outcome, issues }
    },
  }
}
