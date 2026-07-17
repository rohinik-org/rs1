import { createHash } from 'node:crypto'
import type { RohiniKPackageManifest } from '@rohinik-org/compiler'

export interface IntegrityCheckResult {
  readonly passed: boolean
  readonly computedHash: string
  readonly declaredHash?: string
  readonly finding?: 'INTEGRITY_MISMATCH'
}

export function checkContentIntegrity(
  content: Buffer | string,
  manifest: RohiniKPackageManifest,
): IntegrityCheckResult {
  const computedHash = createHash('sha256')
    .update(typeof content === 'string' ? Buffer.from(content) : content)
    .digest('hex')
  const declaredHash = manifest.trust?.contentHash
  if (!declaredHash) return { passed: true, computedHash }
  const passed = computedHash === declaredHash
  return {
    passed,
    computedHash,
    declaredHash,
    ...(passed ? {} : { finding: 'INTEGRITY_MISMATCH' as const }),
  }
}
