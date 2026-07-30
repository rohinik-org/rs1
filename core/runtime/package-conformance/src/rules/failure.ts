import type { ConformanceRule, ConformanceSubject, RuleResult, ConformanceIssue } from '../conformance-engine.js'
import type { ConfigurationDeclarations } from '@rohinik-org/package-manifest-ir'

// ponytail: warns when a package has required secrets but no readiness probe —
// configuration.ts already hard-fails on empty secret names, so this covers the
// complementary case: non-empty required secret with no health.readiness to detect
// missing values at startup.

export function createFailureRule(): ConformanceRule {
  return {
    ruleId: '9k-failure-detection',
    kind: 'static',
    description: 'required secrets without a readiness probe may not be detected at startup',
    async evaluate(subject: ConformanceSubject): Promise<RuleResult> {
      const p = subject.payload as Record<string, unknown>
      const issues: ConformanceIssue[] = []

      const config = p.configuration as ConfigurationDeclarations | undefined
      const secrets = config?.secrets ?? []
      const hasRequiredSecrets = Array.isArray(secrets) && secrets.some((s) => s.required === true)

      const health = p.health as Record<string, unknown> | undefined
      const hasReadinessProbe = typeof health?.readiness === 'string' && health.readiness.length > 0

      if (hasRequiredSecrets && !hasReadinessProbe) {
        issues.push({
          ruleId: '9k-failure-detection',
          severity: 'warning',
          code: 'conformance-failed',
          message: 'Package has required secrets but no readiness probe declared — startup failures may not be detected',
        })
      }

      const outcome = issues.length > 0 ? 'warned' : 'passed'
      return { ruleId: '9k-failure-detection', kind: 'static', outcome, issues }
    },
  }
}
