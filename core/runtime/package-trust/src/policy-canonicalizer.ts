import { createHash } from 'node:crypto'
import canonicalize from 'canonical-json'
import type {
  PackageTrustPolicySnapshot,
  TrustRootSnapshot,
  RevocationSnapshot,
  PackagePermissionManifest,
  IntegrityDigest,
} from '@rohinik-org/package-trust-ir'

export function hashCanonical(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

export function parseTimestamp(raw: string, context: string): Date {
  const d = new Date(raw)
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid timestamp in ${context}: ${raw}`)
  }
  return d
}

export function hashPolicySnapshot(snapshot: PackageTrustPolicySnapshot): string {
  const { semanticHash: _, ...rest } = snapshot
  return hashCanonical(rest)
}

export function hashTrustRootSnapshot(snapshot: TrustRootSnapshot): string {
  const { semanticHash: _, ...rest } = snapshot
  return hashCanonical(rest)
}

export function hashRevocationSnapshot(snapshot: RevocationSnapshot): string {
  const { semanticHash: _, ...rest } = snapshot
  return hashCanonical(rest)
}

export function hashPermissionManifest(manifest: PackagePermissionManifest): string {
  const { semanticHash: _, ...rest } = manifest
  return hashCanonical(rest)
}

export function integrityIdentity(digest: IntegrityDigest): string {
  return `${digest.algorithm}:${digest.encoding}:${digest.value}`
}
