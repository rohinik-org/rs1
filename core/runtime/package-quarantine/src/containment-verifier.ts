import type { ArtifactStorage } from './ports/artifact-storage.js'
import type {
  QuarantineContainmentPlan,
  PackageQuarantineRequest,
  StorageReceipt,
} from './types.js'

export interface VerificationResult {
  readonly verified: boolean
  readonly findings: readonly string[]
}

export async function verifyContainment(
  plan: QuarantineContainmentPlan,
  receipts: readonly StorageReceipt[],
  request: PackageQuarantineRequest,
  artifactStorage: ArtifactStorage,
): Promise<VerificationResult> {
  const findings: string[] = []

  const dest = plan.destinationLocation ?? plan.sourceLocation

  // Check destination exists for isolate/copy-and-seal
  if (plan.mode === 'isolate' || plan.mode === 'copy-and-seal') {
    const stat = await artifactStorage.stat(dest)
    if (!stat.exists) {
      findings.push(`destination not found: ${dest}`)
    } else {
      // Destination must not be activatable
      if (stat.activatable) {
        findings.push(`destination is still activatable: ${dest}`)
      }
      // Identity continuity
      try {
        const identity = await artifactStorage.verifyIdentity(dest)
        if (identity.activatable) {
          findings.push(`identity receipt shows destination is activatable: ${dest}`)
        }
        if (request.policy.requireIdentityContinuity) {
          if (identity.packageId !== request.subject.packageId) {
            findings.push(`identity mismatch: expected packageId ${request.subject.packageId}, got ${identity.packageId}`)
          }
          if (identity.version && identity.version !== request.subject.version) {
            findings.push(`identity mismatch: expected version ${request.subject.version}, got ${identity.version}`)
          }
        }
      } catch (err) {
        findings.push(`identity verification failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  // For seal mode: check source is sealed
  if (plan.mode === 'seal') {
    const stat = await artifactStorage.stat(plan.sourceLocation)
    if (stat.exists && !stat.sealed) {
      findings.push(`source is not sealed: ${plan.sourceLocation}`)
    }
  }

  // For deny-activation and copy-and-seal: check source is not activatable
  if (plan.mode === 'deny-activation' || plan.mode === 'copy-and-seal') {
    const stat = await artifactStorage.stat(plan.sourceLocation)
    if (stat.exists && stat.activatable) {
      findings.push(`source activation reference not removed: ${plan.sourceLocation}`)
    }
  }

  return { verified: findings.length === 0, findings }
}
