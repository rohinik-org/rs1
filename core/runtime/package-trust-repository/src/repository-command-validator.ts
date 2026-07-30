import { RepositoryWriteConflict } from './types.js'
import type {
  RecordTrustDecisionCommand,
  RecordQuarantineResultCommand,
  AppendTrustEventCommand,
  RecordSupersessionCommand,
} from './types.js'

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
const SCHEMA_VERSION = '1.0'
const MAX_PAYLOAD_BYTES = 65536

function requireNonEmpty(val: string | undefined, field: string): void {
  if (!val || val.trim().length === 0) {
    throw new RepositoryWriteConflict('command-validation-failure', `Missing or empty required field: ${field}`)
  }
}

function requireTimestamp(val: string | undefined, field: string): void {
  if (!val || !ISO_RE.test(val)) {
    throw new RepositoryWriteConflict('command-validation-failure', `Malformed timestamp in field: ${field}`)
  }
}

function requireSubject(subject: unknown): void {
  if (!subject || typeof subject !== 'object') {
    throw new RepositoryWriteConflict('command-validation-failure', 'Missing subject')
  }
  const s = subject as Record<string, unknown>
  if (typeof s['packageId'] !== 'string' || (s['packageId'] as string).trim().length === 0) {
    throw new RepositoryWriteConflict('command-validation-failure', 'Subject missing packageId')
  }
  if (typeof s['version'] !== 'string' || (s['version'] as string).trim().length === 0) {
    throw new RepositoryWriteConflict('command-validation-failure', 'Subject missing version')
  }
}

function requireArtifactIdentity(ai: unknown): void {
  if (!ai || typeof ai !== 'object') {
    throw new RepositoryWriteConflict('command-validation-failure', 'Missing artifactIdentity')
  }
  const a = ai as Record<string, unknown>
  if (typeof a['packageId'] !== 'string' || (a['packageId'] as string).trim().length === 0) {
    throw new RepositoryWriteConflict('command-validation-failure', 'ArtifactIdentity missing packageId')
  }
  if (typeof a['artifactDigest'] !== 'string' || (a['artifactDigest'] as string).trim().length === 0) {
    throw new RepositoryWriteConflict('command-validation-failure', 'ArtifactIdentity missing artifactDigest')
  }
}

function requirePolicyReference(pr: unknown): void {
  if (!pr || typeof pr !== 'object') {
    throw new RepositoryWriteConflict('command-validation-failure', 'Missing policyReference')
  }
  const p = pr as Record<string, unknown>
  if (typeof p['policyId'] !== 'string' || (p['policyId'] as string).trim().length === 0) {
    throw new RepositoryWriteConflict('command-validation-failure', 'PolicyReference missing policyId')
  }
}

function requireNoDuplicateAssessments(refs: readonly unknown[]): void {
  const seen = new Set<string>()
  for (const r of refs) {
    const ref = r as Record<string, unknown>
    const key = `${ref['assessmentKind']}:${ref['assessmentId']}`
    if (seen.has(key)) {
      throw new RepositoryWriteConflict('command-validation-failure', `Duplicate assessment reference: ${key}`)
    }
    seen.add(key)
  }
}

function requireValidRevision(rev: number | undefined): void {
  if (rev !== undefined && (!Number.isInteger(rev) || rev < 0)) {
    throw new RepositoryWriteConflict('command-validation-failure', `Invalid expectedRevision: ${rev}`)
  }
}

function checkPayloadSize(payload: Readonly<Record<string, unknown>>): void {
  const size = JSON.stringify(payload).length
  if (size > MAX_PAYLOAD_BYTES) {
    throw new RepositoryWriteConflict('payload-too-large', `Event payload exceeds ${MAX_PAYLOAD_BYTES} bytes (got ${size})`)
  }
}

const PROHIBITED_EVENT_KEYS = new Set(['password', 'secret', 'privateKey', 'credentials', 'token', 'apiKey', 'packageBytes', 'executableContent'])

function checkPayloadForSecrets(payload: Readonly<Record<string, unknown>>): void {
  for (const key of Object.keys(payload)) {
    if (PROHIBITED_EVENT_KEYS.has(key)) {
      throw new RepositoryWriteConflict('secret-field-rejected', `Prohibited field in event payload: ${key}`)
    }
  }
}

function rejectPartitionTraversal(id: string, field: string): void {
  if (id.includes('..') || id.includes('/') || id.includes('\\') || id.includes('\0')) {
    throw new RepositoryWriteConflict('partition-traversal-rejected', `Partition traversal detected in field ${field}: ${id}`)
  }
}

export function validateRecordTrustDecisionCommand(cmd: RecordTrustDecisionCommand): void {
  requireNonEmpty(cmd.operationId, 'operationId')
  requireNonEmpty(cmd.recordId, 'recordId')
  requireSubject(cmd.subject)
  requireArtifactIdentity(cmd.artifactIdentity)
  if (!cmd.decision) throw new RepositoryWriteConflict('command-validation-failure', 'Missing decision')
  requirePolicyReference(cmd.policyReference)
  requireTimestamp(cmd.recordedAt, 'recordedAt')
  requireNoDuplicateAssessments(cmd.assessmentReferences)
  requireValidRevision(cmd.expectedRevision)
  rejectPartitionTraversal(cmd.subject.packageId, 'subject.packageId')
  rejectPartitionTraversal(cmd.artifactIdentity.artifactDigest, 'artifactIdentity.artifactDigest')
}

export function validateRecordQuarantineResultCommand(cmd: RecordQuarantineResultCommand): void {
  requireNonEmpty(cmd.operationId, 'operationId')
  requireNonEmpty(cmd.recordId, 'recordId')
  requireSubject(cmd.subject)
  requireArtifactIdentity(cmd.artifactIdentity)
  requireNonEmpty(cmd.trustDecisionRecordId, 'trustDecisionRecordId')
  if (!cmd.quarantineResult) throw new RepositoryWriteConflict('command-validation-failure', 'Missing quarantineResult')
  requirePolicyReference(cmd.policyReference)
  requireTimestamp(cmd.recordedAt, 'recordedAt')
  requireValidRevision(cmd.expectedRevision)
}

export function validateAppendTrustEventCommand(cmd: AppendTrustEventCommand): void {
  requireNonEmpty(cmd.operationId, 'operationId')
  requireNonEmpty(cmd.eventId, 'eventId')
  if (!cmd.eventType) throw new RepositoryWriteConflict('command-validation-failure', 'Missing eventType')
  requireSubject(cmd.subject)
  requireTimestamp(cmd.occurredAt, 'occurredAt')
  requireTimestamp(cmd.recordedAt, 'recordedAt')
  checkPayloadSize(cmd.payload)
  checkPayloadForSecrets(cmd.payload)
  requireValidRevision(cmd.expectedPartitionRevision)
}

export function validateRecordSupersessionCommand(cmd: RecordSupersessionCommand): void {
  requireNonEmpty(cmd.operationId, 'operationId')
  requireNonEmpty(cmd.priorRecordId, 'priorRecordId')
  requireNonEmpty(cmd.successorRecordId, 'successorRecordId')
  if (!cmd.reason) throw new RepositoryWriteConflict('command-validation-failure', 'Missing reason')
  requireTimestamp(cmd.recordedAt, 'recordedAt')
  requireValidRevision(cmd.expectedRevision)
  if (cmd.priorRecordId === cmd.successorRecordId) {
    throw new RepositoryWriteConflict('self-supersession', 'A record cannot supersede itself')
  }
}
