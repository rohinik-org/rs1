import { createHash } from 'node:crypto'
import { canonicalStringify } from '@rohinik-org/capability-contracts'
import type { JsonValue } from '@rohinik-org/capability-contracts-ir'
import {
  toApplicationManifestSourceHash,
  toApplicationManifestSemanticHash,
} from '@rohinik-org/application-manifest-ir'
import type {
  ApplicationManifestSourceHash,
  ApplicationManifestSemanticHash,
} from '@rohinik-org/application-manifest-ir'

export function computeSourceHash(yamlSource: string): ApplicationManifestSourceHash {
  const hex = createHash('sha256').update(yamlSource, 'utf8').digest('hex')
  return toApplicationManifestSourceHash(hex)
}

export function computeSemanticHash(projection: unknown): ApplicationManifestSemanticHash {
  const canonical = canonicalStringify(projection as JsonValue)
  const hex = createHash('sha256').update(canonical, 'utf8').digest('hex')
  return toApplicationManifestSemanticHash(hex)
}
