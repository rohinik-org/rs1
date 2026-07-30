import { computeRecordDigest } from './record-digest-computer.js'
import {
  validateRecordTrustDecisionCommand,
  validateRecordQuarantineResultCommand,
  validateAppendTrustEventCommand,
  validateRecordSupersessionCommand,
} from './repository-command-validator.js'
import { validateTrustRecord } from './trust-record-validator.js'
import { validateQuarantineRecord } from './quarantine-record-validator.js'
import { validateEventRecord } from './event-validator.js'
import { RepositoryWriteConflict } from './types.js'
import type {
  RecordTrustDecisionCommand,
  RecordQuarantineResultCommand,
  AppendTrustEventCommand,
  RecordSupersessionCommand,
  PackageTrustDecisionRecord,
  PackageQuarantineRecord,
  PackageTrustEventRecord,
  RepositoryWriteReceipt,
  QuarantineWriteReceipt,
  SupersessionReceipt,
  OperationId,
  RepositoryRecordId,
  RepositoryRevision,
} from './types.js'
import type { TrustRecordStore } from './ports/trust-record-store.js'
import type { QuarantineRecordStore } from './ports/quarantine-record-store.js'
import type { TrustEventStore } from './ports/trust-event-store.js'

const SCHEMA_VERSION = '1.0'

interface IdempotencyEntry {
  readonly canonicalDigest: string
  readonly receipt: RepositoryWriteReceipt | QuarantineWriteReceipt | SupersessionReceipt
}

export function createRepositoryWriteCoordinator(
  trustStore: TrustRecordStore,
  quarantineStore: QuarantineRecordStore,
  eventStore: TrustEventStore,
  supersessionManager: ReturnType<typeof import('./supersession-manager.js').createSupersessionManager>,
  lineageManager: ReturnType<typeof import('./lineage-manager.js').createLineageManager>,
) {
  // operationId → idempotency entry
  const idempotencyIndex = new Map<string, IdempotencyEntry>()
  let globalRevision = 0 as RepositoryRevision

  function nextRevision(): RepositoryRevision {
    globalRevision = (globalRevision + 1) as RepositoryRevision
    return globalRevision
  }

  function checkRevision(expectedRevision: number | undefined): void {
    if (expectedRevision !== undefined && expectedRevision !== globalRevision) {
      throw new RepositoryWriteConflict('revision-conflict',
        `Expected revision ${expectedRevision} but current is ${globalRevision}`,
        undefined,
      )
    }
  }

  async function recordTrustDecision(cmd: RecordTrustDecisionCommand): Promise<RepositoryWriteReceipt> {
    validateRecordTrustDecisionCommand(cmd)
    checkRevision(cmd.expectedRevision)

    // Idempotency check before consuming a revision
    const existingEntry = idempotencyIndex.get(cmd.operationId)
    if (existingEntry !== undefined) {
      const effectiveAtForCheck = cmd.effectiveAt ?? cmd.recordedAt
      const checkRecord: Omit<PackageTrustDecisionRecord, 'canonicalDigest'> = {
        recordId:             cmd.recordId as RepositoryRecordId,
        operationId:          cmd.operationId as OperationId,
        subject:              cmd.subject,
        artifactIdentity:     cmd.artifactIdentity,
        decision:             cmd.decision,
        assessmentReferences: cmd.assessmentReferences,
        policyReference:      cmd.policyReference,
        ...(cmd.evidenceReference !== undefined && { evidenceReference: cmd.evidenceReference }),
        recordedAt:           cmd.recordedAt,
        effectiveAt:          effectiveAtForCheck,
        repositoryRevision:   (existingEntry.receipt as RepositoryWriteReceipt).revision,
      }
      const checkDigest = computeRecordDigest(SCHEMA_VERSION, 'PackageTrustDecisionRecord', checkRecord)
      if (existingEntry.canonicalDigest === checkDigest) {
        return { ...(existingEntry.receipt as RepositoryWriteReceipt), idempotent: true }
      }
      throw new RepositoryWriteConflict('idempotency-conflict',
        `Operation ${cmd.operationId} already committed with different payload`,
        cmd.operationId as OperationId)
    }

    const effectiveAt = cmd.effectiveAt ?? cmd.recordedAt
    const revision = nextRevision()

    const recordWithoutDigest: Omit<PackageTrustDecisionRecord, 'canonicalDigest'> = {
      recordId:             cmd.recordId as RepositoryRecordId,
      operationId:          cmd.operationId as OperationId,
      subject:              cmd.subject,
      artifactIdentity:     cmd.artifactIdentity,
      decision:             cmd.decision,
      assessmentReferences: cmd.assessmentReferences,
      policyReference:      cmd.policyReference,
      ...(cmd.evidenceReference !== undefined && { evidenceReference: cmd.evidenceReference }),
      recordedAt:           cmd.recordedAt,
      effectiveAt,
      repositoryRevision:   revision,
    }
    const digest = computeRecordDigest(SCHEMA_VERSION, 'PackageTrustDecisionRecord', recordWithoutDigest)
    const record: PackageTrustDecisionRecord = { ...recordWithoutDigest, canonicalDigest: digest }

    validateTrustRecord(record)

    await trustStore.append(record)

    const event: PackageTrustEventRecord = {
      eventId:            `evt-${cmd.operationId}-td`,
      operationId:        cmd.operationId as OperationId,
      eventType:          'trust-decision-recorded',
      subject:            cmd.subject,
      artifactIdentity:   cmd.artifactIdentity,
      decisionRecordId:   cmd.recordId as RepositoryRecordId,
      policyReference:    cmd.policyReference,
      payload:            { decision: cmd.decision },
      occurredAt:         cmd.recordedAt,
      recordedAt:         cmd.recordedAt,
      repositoryRevision: revision,
      canonicalDigest:    computeRecordDigest(SCHEMA_VERSION, 'PackageTrustEventRecord', { eventType: 'trust-decision-recorded', recordId: cmd.recordId }),
    }
    await eventStore.append(event)

    lineageManager.recordTrustDecision(
      cmd.subject.packageId,
      cmd.subject.version,
      cmd.artifactIdentity.artifactDigest,
      cmd.recordId as RepositoryRecordId,
    )

    const receipt: RepositoryWriteReceipt = {
      operationId: cmd.operationId as OperationId,
      recordId:    cmd.recordId as RepositoryRecordId,
      revision,
      recordedAt:  cmd.recordedAt,
      idempotent:  false,
    }
    idempotencyIndex.set(cmd.operationId, { canonicalDigest: digest, receipt })
    return receipt
  }

  async function recordQuarantineResult(cmd: RecordQuarantineResultCommand): Promise<QuarantineWriteReceipt> {
    validateRecordQuarantineResultCommand(cmd)
    checkRevision(cmd.expectedRevision)

    // Referential integrity: trustDecisionRecordId must exist
    const decisionRecord = await trustStore.getById(cmd.trustDecisionRecordId)
    if (!decisionRecord) {
      throw new RepositoryWriteConflict('referential-integrity-failure',
        `Referenced trustDecisionRecordId not found: ${cmd.trustDecisionRecordId}`)
    }

    const effectiveAt = cmd.effectiveAt ?? cmd.recordedAt
    const revision = nextRevision()

    const recordWithoutDigest: Omit<PackageQuarantineRecord, 'canonicalDigest'> = {
      recordId:              cmd.recordId as RepositoryRecordId,
      operationId:           cmd.operationId as OperationId,
      subject:               cmd.subject,
      artifactIdentity:      cmd.artifactIdentity,
      trustDecisionRecordId: cmd.trustDecisionRecordId as RepositoryRecordId,
      quarantineResult:      cmd.quarantineResult,
      policyReference:       cmd.policyReference,
      recordedAt:            cmd.recordedAt,
      effectiveAt,
      repositoryRevision:    revision,
    }
    const digest = computeRecordDigest(SCHEMA_VERSION, 'PackageQuarantineRecord', recordWithoutDigest)
    const record: PackageQuarantineRecord = { ...recordWithoutDigest, canonicalDigest: digest }

    const existing = idempotencyIndex.get(cmd.operationId)
    if (existing !== undefined) {
      if (existing.canonicalDigest === digest) {
        return { ...(existing.receipt as QuarantineWriteReceipt), idempotent: true }
      }
      throw new RepositoryWriteConflict('idempotency-conflict',
        `Operation ${cmd.operationId} already committed with different payload`,
        cmd.operationId as OperationId)
    }

    validateQuarantineRecord(record)

    await quarantineStore.append(record)

    const event: PackageTrustEventRecord = {
      eventId:             `evt-${cmd.operationId}-qr`,
      operationId:         cmd.operationId as OperationId,
      eventType:           'quarantine-recorded',
      subject:             cmd.subject,
      artifactIdentity:    cmd.artifactIdentity,
      quarantineRecordId:  cmd.recordId as RepositoryRecordId,
      policyReference:     cmd.policyReference,
      payload:             { status: cmd.quarantineResult.status },
      occurredAt:          cmd.recordedAt,
      recordedAt:          cmd.recordedAt,
      repositoryRevision:  revision,
      canonicalDigest:     computeRecordDigest(SCHEMA_VERSION, 'PackageTrustEventRecord', { eventType: 'quarantine-recorded', recordId: cmd.recordId }),
    }
    await eventStore.append(event)

    lineageManager.recordQuarantine(
      cmd.subject.packageId,
      cmd.subject.version,
      cmd.artifactIdentity.artifactDigest,
      cmd.recordId as RepositoryRecordId,
    )

    const receipt: QuarantineWriteReceipt = {
      operationId: cmd.operationId as OperationId,
      recordId:    cmd.recordId as RepositoryRecordId,
      revision,
      recordedAt:  cmd.recordedAt,
      idempotent:  false,
    }
    idempotencyIndex.set(cmd.operationId, { canonicalDigest: digest, receipt })
    return receipt
  }

  async function appendTrustEvent(cmd: AppendTrustEventCommand): Promise<void> {
    validateAppendTrustEventCommand(cmd)

    const revision = nextRevision()
    const eventRecord: PackageTrustEventRecord = {
      eventId:             cmd.eventId,
      operationId:         cmd.operationId,
      eventType:           cmd.eventType,
      subject:             cmd.subject,
      ...(cmd.artifactIdentity !== undefined && { artifactIdentity: cmd.artifactIdentity }),
      ...(cmd.decisionRecordId !== undefined && { decisionRecordId: cmd.decisionRecordId }),
      ...(cmd.quarantineRecordId !== undefined && { quarantineRecordId: cmd.quarantineRecordId }),
      ...(cmd.policyReference !== undefined && { policyReference: cmd.policyReference }),
      payload:             cmd.payload,
      occurredAt:          cmd.occurredAt,
      recordedAt:          cmd.recordedAt,
      repositoryRevision:  revision,
      canonicalDigest:     computeRecordDigest(SCHEMA_VERSION, 'PackageTrustEventRecord', {
        eventId: cmd.eventId, eventType: cmd.eventType, occurredAt: cmd.occurredAt,
      }),
    }

    validateEventRecord(eventRecord)
    await eventStore.append(eventRecord)
  }

  async function recordSupersession(cmd: RecordSupersessionCommand): Promise<SupersessionReceipt> {
    validateRecordSupersessionCommand(cmd)
    checkRevision(cmd.expectedRevision)

    const lookupSubject = async (id: RepositoryRecordId) => {
      const r = await trustStore.getById(id)
      return r ? { packageId: r.subject.packageId, version: r.subject.version } : undefined
    }

    // Wrap sync supersession-manager call with async lookup
    const prior = await trustStore.getById(cmd.priorRecordId as RepositoryRecordId)
    const successor = await trustStore.getById(cmd.successorRecordId as RepositoryRecordId)

    if (!prior) throw new RepositoryWriteConflict('referential-integrity-failure', `Prior record not found: ${cmd.priorRecordId}`)
    if (!successor) throw new RepositoryWriteConflict('referential-integrity-failure', `Successor record not found: ${cmd.successorRecordId}`)

    const link = supersessionManager.recordSupersession(cmd, (id) => {
      if (id === (cmd.priorRecordId as RepositoryRecordId)) return { packageId: prior.subject.packageId, version: prior.subject.version }
      if (id === (cmd.successorRecordId as RepositoryRecordId)) return { packageId: successor.subject.packageId, version: successor.subject.version }
      return undefined
    })

    const revision = nextRevision()

    const event: PackageTrustEventRecord = {
      eventId:            `evt-${cmd.operationId}-sup`,
      operationId:        cmd.operationId,
      eventType:          'supersession-recorded',
      subject:            prior.subject,
      payload:            { priorRecordId: cmd.priorRecordId, successorRecordId: cmd.successorRecordId, reason: cmd.reason },
      occurredAt:         cmd.recordedAt,
      recordedAt:         cmd.recordedAt,
      repositoryRevision: revision,
      canonicalDigest:    computeRecordDigest(SCHEMA_VERSION, 'PackageTrustEventRecord', { eventType: 'supersession-recorded', priorRecordId: cmd.priorRecordId }),
    }
    await eventStore.append(event)

    lineageManager.recordSupersession(
      prior.subject.packageId,
      prior.subject.version,
      prior.artifactIdentity.artifactDigest,
      link,
    )

    return {
      operationId:        cmd.operationId,
      priorRecordId:      cmd.priorRecordId as RepositoryRecordId,
      successorRecordId:  cmd.successorRecordId as RepositoryRecordId,
      revision,
      recordedAt:         cmd.recordedAt,
      idempotent:         false,
    }
  }

  function getCurrentRevision(): RepositoryRevision {
    return globalRevision
  }

  return { recordTrustDecision, recordQuarantineResult, appendTrustEvent, recordSupersession, getCurrentRevision }
}
