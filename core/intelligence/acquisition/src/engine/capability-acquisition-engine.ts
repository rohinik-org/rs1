import { randomUUID, createHash } from 'node:crypto'
import type {
  LearningTrigger,
  CapabilityCandidateSet,
  CapabilityDescriptorIR,
  DEFAULT_ACQUISITION_POLICY,
} from '@rohinik-org/compiler'
import { DEFAULT_ACQUISITION_POLICY as _DEFAULT_POLICY } from '@rohinik-org/compiler'
import type { AcquisitionPolicy, CapabilityCandidate } from '@rohinik-org/compiler'
import type { Installer } from '@rohinik-org/installer'
import { LearningTriggerHandler } from '../trigger/learning-trigger-handler.js'
import type { CapabilitySource } from '../sources/capability-source.js'
import { CapabilityValidator } from '../validation/capability-validator.js'
import { AcquisitionPolicyEngine } from '../policy/acquisition-policy-engine.js'
import type { AcquisitionStore } from '../store/acquisition-store.js'

export interface AcquisitionResult {
  readonly triggerId: string
  readonly candidateSetId: string
  readonly approvals: ReadonlyArray<{ candidateId: string; decision: string }>
}

export class CapabilityAcquisitionEngine {
  private readonly triggerHandler = new LearningTriggerHandler()
  private readonly validator = new CapabilityValidator()
  private readonly policyEngine = new AcquisitionPolicyEngine()

  constructor(
    private readonly sources: CapabilitySource[],
    private readonly store: AcquisitionStore,
    private readonly policy: AcquisitionPolicy = _DEFAULT_POLICY,
    private readonly installer?: Installer,
  ) {}

  async acquire(trigger: LearningTrigger): Promise<AcquisitionResult> {
    const query = this.triggerHandler.handle(trigger)

    const allCandidates: CapabilityCandidate[] = []
    for (const source of this.sources) {
      const found = await source.discover(query)
      allCandidates.push(...found)
    }

    const setId = randomUUID()
    const candidateSet: CapabilityCandidateSet = {
      kind: 'CapabilityCandidateSet',
      setId,
      queryId: query.queryId,
      triggerId: trigger.triggerId,
      candidates: allCandidates,
      producedAt: new Date().toISOString(),
    }
    await this.store.saveCandidateSet(candidateSet)

    const approvals: Array<{ candidateId: string; decision: string }> = []

    for (const candidate of allCandidates) {
      const report = this.validator.validate(candidate)
      await this.store.saveValidationReport(report)

      const approval = this.policyEngine.decide(candidate, report, this.policy)
      await this.store.saveApproval(approval)

      if (approval.decision === 'APPROVED') {
        const descriptor = _buildDescriptor(candidate)
        await this.store.saveDescriptor(descriptor)

        if (this.installer) {
          await this.installer.install(candidate)
        }
      }

      approvals.push({ candidateId: candidate.candidateId, decision: approval.decision })
    }

    return { triggerId: trigger.triggerId, candidateSetId: setId, approvals }
  }
}

function _buildDescriptor(candidate: CapabilityCandidate): CapabilityDescriptorIR {
  const now = new Date().toISOString()
  const body = JSON.stringify({ name: candidate.name, source: candidate.installSource })
  const artifactId = createHash('sha256').update(body).digest('hex')

  return {
    meta: {
      artifactId,
      schemaVersion: '1.0',
      kind: 'CapabilityDescriptorIR',
      createdAt: now,
      producer: '@rohinik-org/acquisition',
    },
    integrity: { checksum: artifactId },
    lifecycle: { state: 'ACTIVE' },
    provenance: {
      systemSnapshotId: randomUUID(),
      parentArtifacts: [],
      sessionId: randomUUID(),
    },
    origin: {
      protocol: candidate.installSource.scheme,
      adapterId: candidate.candidateId,
      adapterVersion: '0.1.0',
      protocolVersion: '1.0',
      discoveryHash: artifactId,
      capturedAt: now,
    },
    capabilities: [{
      id: candidate.candidateId,
      name: candidate.name,
      description: candidate.description,
      tags: [...candidate.tags],
    }],
  }
}
