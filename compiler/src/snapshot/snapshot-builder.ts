import { createHash, randomUUID } from 'node:crypto'
import type { CapabilitySnapshot, SkillDescriptor } from '../types/capability-snapshot.js'
import type { SnapshotId, SessionId, SemanticCapability } from '../types/primitives.js'

interface RuntimeResponse {
  runtimeId: string
  state: string
  build: { protocolVersion: string }
  features: { memory: boolean; streaming: boolean; reasoning: boolean }
}

interface CapabilitiesResponse {
  capabilities: Array<{ skillId: string; name: string; tierId: string; version: string }>
}

export class CapabilitySnapshotBuilder {
  constructor(private readonly baseUrl: string) {}

  async build(sessionId: SessionId, systemSnapshotId: SnapshotId): Promise<CapabilitySnapshot> {
    const runtimeFetch = await fetch(`${this.baseUrl}/v1/runtime`)
    if (!runtimeFetch.ok) {
      throw new Error(`CapabilitySnapshotBuilder: GET /v1/runtime returned HTTP ${runtimeFetch.status}`)
    }
    const runtimeRes = await runtimeFetch.json() as RuntimeResponse

    if (runtimeRes.state !== 'READY') {
      throw new Error(`Runtime is not READY (state: ${runtimeRes.state})`)
    }

    const capFetch = await fetch(`${this.baseUrl}/v1/capabilities`)
    if (!capFetch.ok) {
      throw new Error(`CapabilitySnapshotBuilder: GET /v1/capabilities returned HTTP ${capFetch.status}`)
    }
    const capRes = await capFetch.json() as CapabilitiesResponse

    const skills: SkillDescriptor[] = capRes.capabilities.map(c => ({
      skillId: c.skillId,
      capabilityId: c.skillId.split('.')[0] ?? c.skillId,
      tierId: c.tierId,
      version: c.version,
      semantics: [c.skillId] as SemanticCapability[],
      requirements: [],
    }))

    const fingerprint = createHash('sha256')
      .update(JSON.stringify(skills.map(s => s.skillId).sort()))
      .digest('hex')

    const snapshotId = fingerprint as SnapshotId
    const artifactId = randomUUID()
    const now = new Date().toISOString()

    return {
      meta: { artifactId, schemaVersion: '1.0', kind: 'CapabilitySnapshot', createdAt: now, producer: '@rohinik-org/compiler@0.1.0' },
      provenance: { systemSnapshotId, parentArtifacts: [], sessionId },
      integrity: { checksum: fingerprint },
      lifecycle: { state: 'ACTIVE' },
      snapshotId,
      capturedAt: now,
      runtimeId: runtimeRes.runtimeId,
      source: 'GET /v1/capabilities',
      fingerprint,
      skills,
    }
  }
}
