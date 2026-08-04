import type { RohiniKPackageManifest, EnterprisePolicy } from '@rohinik-org/compiler'
import type { InstallSource } from '@rohinik-org/adapter-ir'

export interface PolicyFinding {
  readonly code:
    | 'SOURCE_NOT_ALLOWED'
    | 'ID_BLOCKED'
    | 'COMPLIANCE_LEVEL_INSUFFICIENT'
    | 'SIGNATURE_REQUIRED'
    | 'APPROVAL_REQUIRED'
  readonly message: string
}

export interface PolicyCheckResult {
  readonly allowed: boolean
  readonly findings: readonly PolicyFinding[]
}

export interface PolicyEngine {
  check(manifest: RohiniKPackageManifest, source: InstallSource): PolicyCheckResult
}

export class DefaultPolicyEngine implements PolicyEngine {
  constructor(private readonly policy?: EnterprisePolicy) {}

  check(manifest: RohiniKPackageManifest, source: InstallSource): PolicyCheckResult {
    if (!this.policy) return { allowed: true, findings: [] }
    const findings: PolicyFinding[] = []

    if (this.policy.allowedSources && this.policy.allowedSources.length > 0) {
      const sourceAllowed = this.policy.allowedSources.some(s =>
        source.scheme === s || `${source.scheme}:` === s || source.location.startsWith(s)
      )
      if (!sourceAllowed) {
        findings.push({ code: 'SOURCE_NOT_ALLOWED', message: `Source '${source.scheme}:${source.location}' is not in the allowed sources list.` })
      }
    }

    if (this.policy.blockedIds?.includes(manifest.id)) {
      findings.push({ code: 'ID_BLOCKED', message: `Package '${manifest.id}' is blocked by enterprise policy.` })
    }

    if (this.policy.requiredComplianceLevel !== undefined) {
      const declaredLevel = manifest.compliance?.targetLevel ?? 0
      if (declaredLevel < this.policy.requiredComplianceLevel) {
        findings.push({ code: 'COMPLIANCE_LEVEL_INSUFFICIENT', message: `Package declares compliance level ${declaredLevel}, but policy requires ${this.policy.requiredComplianceLevel}.` })
      }
    }

    if (this.policy.requireSignature && !manifest.trust?.signature) {
      findings.push({ code: 'SIGNATURE_REQUIRED', message: 'Package signature is required by enterprise policy.' })
    }

    if (this.policy.approvalRequired) {
      // APPROVAL_REQUIRED is a warning not a block in v1
      findings.push({ code: 'APPROVAL_REQUIRED', message: 'Package requires approval (approval workflow reserved for future versions).' })
    }

    const blockingFindings = findings.filter(f => f.code !== 'APPROVAL_REQUIRED')
    return { allowed: blockingFindings.length === 0, findings }
  }
}
