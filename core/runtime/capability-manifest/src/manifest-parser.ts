import type { DriverDescriptor } from './driver-types.js'
import type { CapabilityManifestIR } from './manifest-types.js'

export const RUNTIME_API_VERSION = 1
export const RUNTIME_MANIFEST_VERSION = 1

const DRIVER_ID_RE = /^[a-z0-9-]+$/
const CAPABILITY_ID_RE = /^[a-z0-9-]+:[a-z0-9-]+$/
const RESERVED_PREFIXES = ['system:', 'internal:', 'runtime:']

function assertDriverId(id: string): void {
  if (!DRIVER_ID_RE.test(id)) throw new Error(`Invalid driver ID: "${id}" — must match ^[a-z0-9-]+$`)
}

function assertCapabilityId(id: string): void {
  if (!CAPABILITY_ID_RE.test(id)) throw new Error(`Invalid capability ID: "${id}" — must match ^[a-z0-9-]+:[a-z0-9-]+$`)
  for (const prefix of RESERVED_PREFIXES) {
    if (id.startsWith(prefix)) throw new Error(`Reserved capability prefix: "${prefix}" in "${id}"`)
  }
}

export function parseDriverDescriptor(raw: Record<string, unknown>): DriverDescriptor {
  const id = raw.id as string
  assertDriverId(id)

  const apiVersion = raw.apiVersion as number
  if (apiVersion !== RUNTIME_API_VERSION) {
    throw new Error(`apiVersion mismatch: expected ${RUNTIME_API_VERSION}, got ${apiVersion}`)
  }

  const priority = raw.priority as number
  if (typeof priority !== 'number' || priority < 1 || priority > 100) {
    throw new Error(`priority must be 1–100, got ${priority}`)
  }

  return {
    id,
    version: raw.version as string,
    apiVersion,
    priority,
    tags: (raw.tags as ReadonlyArray<string>) ?? [],
    capabilities: raw.capabilities as DriverDescriptor['capabilities'],
  }
}

export function parseCapabilityManifest(raw: Record<string, unknown>): CapabilityManifestIR {
  const id = raw.id as string
  assertCapabilityId(id)

  const driverRef = raw.driverRef as string
  assertDriverId(driverRef)

  const manifestVersion = raw.manifestVersion as number
  if (typeof manifestVersion !== 'number' || manifestVersion > RUNTIME_MANIFEST_VERSION) {
    throw new Error(`manifestVersion ${manifestVersion} exceeds runtime maximum ${RUNTIME_MANIFEST_VERSION}`)
  }

  const { id: _id, driverRef: _dref, manifestVersion: _mv, ...rest } = raw
  void _id; void _dref; void _mv

  return {
    manifestVersion,
    id,
    driverRef,
    name: (rest.name as string) ?? id,
    description: (rest.description as string) ?? '',
    version: (rest.version as string) ?? '0.1.0',
    inputs: (rest.inputs as CapabilityManifestIR['inputs']) ?? [],
    outputs: (rest.outputs as CapabilityManifestIR['outputs']) ?? [],
    tier: (rest.tier as string) ?? 'LOCAL',
    tags: (rest.tags as ReadonlyArray<string>) ?? [],
  }
}
