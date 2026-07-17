import type { RohiniKPackageManifest, ComplianceCertificate } from '@rohinik-org/compiler'

export function certifyCompliance(manifest: RohiniKPackageManifest): ComplianceCertificate {
  const compliance = manifest.compliance
  const now = new Date().toISOString()
  if (!compliance) {
    return { achievedLevel: 0, architectureScore: 0, violations: ['NO_COMPLIANCE_DECLARATION'], certifiedAt: now, certifiedBy: '@rohinik-org/artifacts@0.1.0' }
  }
  const violations: string[] = []
  const requiredLawsByLevel: Record<number, number[]> = {
    1: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17],
    2: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20],
  }
  const required = requiredLawsByLevel[compliance.targetLevel] ?? []
  for (const law of required) {
    if (!compliance.laws.includes(law)) violations.push(`MISSING_LAW_${law}`)
  }
  const achievedLevel = violations.length === 0 ? compliance.targetLevel : 0
  const architectureScore = violations.length === 0 ? 100 : Math.max(0, 100 - violations.length * 10)
  return { achievedLevel, architectureScore, violations, certifiedAt: now, certifiedBy: '@rohinik-org/artifacts@0.1.0' }
}
