import type { ConformanceRule, ConformanceSubject, RuleResult, ConformanceIssue } from '../conformance-engine.js'
import type { ConfigurationDeclarations } from '@rohinik-org/package-manifest-ir'

// ponytail: structural-only detection — can only flag secrets where required:true AND name is empty/missing.
// Runtime detection of missing secrets requires actual environment resolution, not static analysis.

export function createFailureRule(): ConformanceRule {
  return {
    ruleId: '9k-failure-detection',
    kind: 'static',
    description: 'required secret with missing/empty name is flagged as warning (structural check)',
    async evaluate(subject: ConformanceSubject): Promise<RuleResult> {
      const p = subject.payload as Record<string, unknown>
      const issues: ConformanceIssue[] = []

      const config = p.configuration as ConfigurationDeclarations | undefined
      if (!config?.secrets) {
        return { ruleId: '9k-failure-detection', kind: 'static', outcome: 'passed', issues: [] }
      }

      for (const secret of config.secrets) {
        if (secret.required === true && (!secret.name || secret.name.trim() === '')) {
          issues.push({
            ruleId: '9k-failure-detection',
            severity: 'warning',
            code: 'conformance-failed',
            message: 'required secret has no name — runtime will not be able to resolve it',
            path: 'configuration.secrets',
          })
        }
      }

      const outcome = issues.length > 0 ? 'warned' : 'passed'
      return { ruleId: '9k-failure-detection', kind: 'static', outcome, issues }
    },
  }
}
