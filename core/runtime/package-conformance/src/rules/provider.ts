import type { ConformanceRule, ConformanceSubject, RuleResult, ConformanceIssue } from '../conformance-engine.js'
import type { ProvidedCapabilityDeclaration } from '@rohinik-org/package-manifest-ir'

// Checks that the package `type` is consistent with presence/absence of `provides`.
// capability-provider and capability-composite must have at least one provided capability.

export function createProviderRule(): ConformanceRule {
  return {
    ruleId: '9k-provider-consistency',
    kind: 'static',
    description: 'provided capabilities are consistent with package type',
    async evaluate(subject: ConformanceSubject): Promise<RuleResult> {
      const p = subject.payload as Record<string, unknown>
      const issues: ConformanceIssue[] = []

      const pkg = p.package as Record<string, unknown> | undefined
      const packageType = pkg?.type as string | undefined
      const provides = (p.provides ?? []) as readonly ProvidedCapabilityDeclaration[]

      if (
        (packageType === 'capability-provider' || packageType === 'capability-composite') &&
        provides.length === 0
      ) {
        issues.push({
          ruleId: '9k-provider-consistency',
          severity: 'error',
          code: 'conformance-failed',
          message: `package type "${packageType}" must declare at least one provided capability in "provides"`,
          path: 'provides',
        })
      }

      const outcome = issues.some(i => i.severity === 'error') ? 'failed' : 'passed'
      return { ruleId: '9k-provider-consistency', kind: 'static', outcome, issues }
    },
  }
}
