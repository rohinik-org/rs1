import type { ConformanceRule, ConformanceSubject, RuleResult, ConformanceIssue } from '../conformance-engine.js'
import type { ConfigurationDeclarations } from '@rohinik-org/package-manifest-ir'

export function createConfigurationRule(): ConformanceRule {
  return {
    ruleId: '9k-configuration-declarations',
    kind: 'static',
    description: 'secret names non-empty, no secret has default field, env var names non-empty',
    async evaluate(subject: ConformanceSubject): Promise<RuleResult> {
      const p = subject.payload as Record<string, unknown>
      const issues: ConformanceIssue[] = []

      const config = p.configuration as ConfigurationDeclarations | undefined
      if (!config) {
        return { ruleId: '9k-configuration-declarations', kind: 'static', outcome: 'passed', issues: [] }
      }

      for (const secret of config.secrets ?? []) {
        if (!secret.name || typeof secret.name !== 'string' || secret.name.trim() === '') {
          issues.push({
            ruleId: '9k-configuration-declarations',
            severity: 'error',
            code: 'conformance-failed',
            message: 'secret name must be a non-empty string',
            path: 'configuration.secrets',
          })
        }
        // ponytail: SecretDeclaration type has no `default` field; check at runtime via cast for forward-compat
        if ('default' in (secret as unknown as Record<string, unknown>)) {
          issues.push({
            ruleId: '9k-configuration-declarations',
            severity: 'error',
            code: 'conformance-failed',
            message: `secret "${secret.name}" must not have a "default" field`,
            path: 'configuration.secrets',
          })
        }
      }

      for (const envVar of config.environment ?? []) {
        if (!envVar.name || typeof envVar.name !== 'string' || envVar.name.trim() === '') {
          issues.push({
            ruleId: '9k-configuration-declarations',
            severity: 'error',
            code: 'conformance-failed',
            message: 'environment variable name must be a non-empty string',
            path: 'configuration.environment',
          })
        }
      }

      const outcome = issues.some(i => i.severity === 'error') ? 'failed' : 'passed'
      return { ruleId: '9k-configuration-declarations', kind: 'static', outcome, issues }
    },
  }
}
