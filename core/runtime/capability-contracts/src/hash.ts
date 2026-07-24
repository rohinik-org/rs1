import { createHash } from 'node:crypto'
import { canonicalStringify } from './canonicalizer.js'
import type {
  JsonValue,
  RequirementHashProjection,
  RequirementSetHashProjection,
  CapabilityRequirementHash,
  CapabilityRequirementSetHash,
} from '@rohinik-org/capability-contracts-ir'

function sha256hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex')
}

// §15 — requirementHash over RequirementHashProjection.
export function computeRequirementHash(projection: RequirementHashProjection): CapabilityRequirementHash {
  return sha256hex(canonicalStringify(projection as unknown as JsonValue)) as CapabilityRequirementHash
}

// §15.1 — semanticHash over RequirementSetHashProjection.
export function computeSetHash(projection: RequirementSetHashProjection): CapabilityRequirementSetHash {
  return sha256hex(canonicalStringify(projection as unknown as JsonValue)) as CapabilityRequirementSetHash
}
