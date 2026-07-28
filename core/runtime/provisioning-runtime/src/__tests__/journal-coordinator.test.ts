import { describe, it, expect, beforeEach } from 'vitest'
import type {
  ProvisioningExecutionId,
  ProvisioningActionId,
  ProvisioningMutationId,
  ProvisioningOperation,
  AuthorizedCompensationDefinition,
  InstantiatedCompensationRecord,
  ProvisioningDiagnosticCode,
  ProvisioningDiagnosticId,
  QuarantinedArtifactRecord,
  IsoTimestamp,
  ResolutionPlanId,
  AuthorizationId,
  QuarantinedArtifactHandle,
  ArtifactAuthorizationId,
  QuarantinePath,
} from '@rohinik-org/provisioning-ir'
import { JournalCoordinator } from '../journal-coordinator.js'

// ── helpers ───────────────────────────────────────────────────────────────────
const execId = 'exec-1' as ProvisioningExecutionId
const planId = 'plan-1' as ResolutionPlanId
const authId = 'auth-1' as AuthorizationId

const mid = (s: string) => s as ProvisioningMutationId
const aid = (s: string) => s as ProvisioningActionId
const diagCode = (s: string) => s as ProvisioningDiagnosticCode
const diagId = (s: string) => s as ProvisioningDiagnosticId

const op: ProvisioningOperation = { kind: 'fetch-artifact', targetId: 'pkg-a' }
const op2: ProvisioningOperation = { kind: 'install-rohinik-package', targetId: 'pkg-b' }

const classification: AuthorizedCompensationDefinition = { kind: 'remove-file', parameters: { path: '/tmp/x' } }
const compensation: InstantiatedCompensationRecord = { kind: 'remove-file', parameters: { path: '/tmp/x' } }

let ticks = 0
const clock = () => `2024-01-01T00:00:0${ticks++}.000Z` as IsoTimestamp

function makeCoordinator() {
  ticks = 0
  return new JournalCoordinator(execId, planId, authId, clock)
}

// ── tests ─────────────────────────────────────────────────────────────────────
describe('JournalCoordinator', () => {
  describe('happy-path event sequence', () => {
    it('prepareMutation → startMutation → recordSuccess appends three entries with correct event values', () => {
      const jc = makeCoordinator()
      const m = mid('m1')
      const a = aid('a1')
      jc.prepareMutation(a, m, op, classification)
      jc.startMutation(a, m, op)
      jc.recordSuccess(a, m, op, compensation)

      const journal = jc.buildJournal()
      expect(journal.entries).toHaveLength(3)
      expect(journal.entries[0].event).toBe('mutation-prepared')
      expect(journal.entries[1].event).toBe('mutation-started')
      expect(journal.entries[2].event).toBe('mutation-succeeded')
    })

    it('entries carry correct actionId, mutationId, executionId, planId, authorizationId', () => {
      const jc = makeCoordinator()
      jc.prepareMutation(aid('a1'), mid('m1'), op, classification)
      const { entries } = jc.buildJournal()
      const e = entries[0]
      expect(e.actionId).toBe('a1')
      expect(e.mutationId).toBe('m1')
      expect(e.executionId).toBe(execId)
      expect(e.planId).toBe(planId)
      expect(e.authorizationId).toBe(authId)
    })

    it('sequence numbers are monotonically increasing across entries', () => {
      const jc = makeCoordinator()
      jc.prepareMutation(aid('a1'), mid('m1'), op, classification)
      jc.startMutation(aid('a1'), mid('m1'), op)
      jc.recordSuccess(aid('a1'), mid('m1'), op)
      const seqs = jc.buildJournal().entries.map(e => e.sequence)
      expect(seqs).toEqual([1, 2, 3])
    })

    it('recordFailure appends mutation-failed entry with diagnosticCodes and diagnosticIds', () => {
      const jc = makeCoordinator()
      jc.prepareMutation(aid('a1'), mid('m1'), op, classification)
      jc.startMutation(aid('a1'), mid('m1'), op)
      jc.recordFailure(aid('a1'), mid('m1'), op, [diagCode('ERR_FETCH')], [diagId('diag-1')])

      const { entries } = jc.buildJournal()
      const last = entries[2]
      expect(last.event).toBe('mutation-failed')
      if (last.event === 'mutation-failed') {
        expect(last.diagnosticCodes).toEqual(['ERR_FETCH'])
        expect(last.diagnosticIds).toEqual(['diag-1'])
      }
    })
  })

  describe('sequence validation — invariant errors', () => {
    it('startMutation without prepareMutation throws invariant error', () => {
      const jc = makeCoordinator()
      expect(() => jc.startMutation(aid('a1'), mid('m1'), op)).toThrow(/startMutation requires prior prepareMutation/)
    })

    it('recordSuccess without startMutation throws invariant error', () => {
      const jc = makeCoordinator()
      jc.prepareMutation(aid('a1'), mid('m1'), op, classification)
      expect(() => jc.recordSuccess(aid('a1'), mid('m1'), op)).toThrow(/recordSuccess requires prior startMutation/)
    })

    it('second recordSuccess for same mutationId throws invariant error', () => {
      const jc = makeCoordinator()
      jc.prepareMutation(aid('a1'), mid('m1'), op, classification)
      jc.startMutation(aid('a1'), mid('m1'), op)
      jc.recordSuccess(aid('a1'), mid('m1'), op)
      expect(() => jc.recordSuccess(aid('a1'), mid('m1'), op)).toThrow(/recordSuccess requires prior startMutation/)
    })

    it('recordSuccess without any prior call throws (state=none)', () => {
      const jc = makeCoordinator()
      expect(() => jc.recordSuccess(aid('a1'), mid('m1'), op)).toThrow(/state=none/)
    })
  })

  describe('getCompensationPlan', () => {
    it('returns successful mutations in REVERSE order', () => {
      const jc = makeCoordinator()
      for (const [a, m] of [['a1','m1'], ['a2','m2'], ['a3','m3']] as [string,string][]) {
        jc.prepareMutation(aid(a), mid(m), op, classification)
        jc.startMutation(aid(a), mid(m), op)
        jc.recordSuccess(aid(a), mid(m), op, compensation)
      }
      const plan = jc.getCompensationPlan()
      expect(plan.map(p => p.mutationId)).toEqual(['m3', 'm2', 'm1'])
    })

    it('excludes mutations recorded without compensation (non-compensable)', () => {
      const jc = makeCoordinator()
      jc.prepareMutation(aid('a1'), mid('m1'), op, { kind: 'non-compensable', approvedReasonCode: 'REUSE' })
      jc.startMutation(aid('a1'), mid('m1'), op)
      jc.recordSuccess(aid('a1'), mid('m1'), op) // no instantiatedCompensation
      expect(jc.getCompensationPlan()).toHaveLength(0)
    })

    it('excludes failed mutations', () => {
      const jc = makeCoordinator()
      jc.prepareMutation(aid('a1'), mid('m1'), op, classification)
      jc.startMutation(aid('a1'), mid('m1'), op)
      jc.recordFailure(aid('a1'), mid('m1'), op, [], [])
      expect(jc.getCompensationPlan()).toHaveLength(0)
    })

    it('mixed: compensable + non-compensable returns only compensable in reverse', () => {
      const jc = makeCoordinator()
      jc.prepareMutation(aid('a1'), mid('m1'), op, classification)
      jc.startMutation(aid('a1'), mid('m1'), op)
      jc.recordSuccess(aid('a1'), mid('m1'), op, compensation)

      jc.prepareMutation(aid('a2'), mid('m2'), op2, { kind: 'non-compensable', approvedReasonCode: 'NO_UNDO' })
      jc.startMutation(aid('a2'), mid('m2'), op2)
      jc.recordSuccess(aid('a2'), mid('m2'), op2)

      jc.prepareMutation(aid('a3'), mid('m3'), op, classification)
      jc.startMutation(aid('a3'), mid('m3'), op)
      jc.recordSuccess(aid('a3'), mid('m3'), op, { kind: 'remove-dir', parameters: {} })

      const plan = jc.getCompensationPlan()
      expect(plan.map(p => p.mutationId)).toEqual(['m3', 'm1'])
    })
  })

  describe('buildJournal — append-only guarantee', () => {
    it('entries snapshot is a copy: mutating the returned array does not affect the coordinator', () => {
      const jc = makeCoordinator()
      jc.prepareMutation(aid('a1'), mid('m1'), op, classification)
      const j1 = jc.buildJournal()
      ;(j1.entries as ProvisioningOperation[]).length // just access
      // mutate the returned array
      ;(j1.entries as unknown as unknown[]).push('fake')
      jc.startMutation(aid('a1'), mid('m1'), op)
      const j2 = jc.buildJournal()
      expect(j2.entries).toHaveLength(2) // unaffected
    })

    it('entry objects are not mutated after appending', () => {
      const jc = makeCoordinator()
      jc.prepareMutation(aid('a1'), mid('m1'), op, classification)
      const j1 = jc.buildJournal()
      const firstEntry = j1.entries[0]
      const seqBefore = firstEntry.sequence
      jc.startMutation(aid('a1'), mid('m1'), op)
      const j2 = jc.buildJournal()
      // first entry sequence unchanged
      expect(j2.entries[0].sequence).toBe(seqBefore)
    })
  })

  describe('hash properties', () => {
    it('semanticJournalHash is deterministic with different timestamps but same action sequence', () => {
      // Two coordinators with different clocks, same logical sequence
      let t1 = 0
      const clock1 = () => `2024-01-01T00:00:0${t1++}.000Z` as IsoTimestamp
      let t2 = 100
      const clock2 = () => `2024-06-15T12:34:5${t2++}.000Z` as IsoTimestamp

      const jc1 = new JournalCoordinator(execId, planId, authId, clock1)
      const jc2 = new JournalCoordinator(execId, planId, authId, clock2)

      for (const jc of [jc1, jc2]) {
        jc.prepareMutation(aid('a1'), mid('m1'), op, classification)
        jc.startMutation(aid('a1'), mid('m1'), op)
        jc.recordSuccess(aid('a1'), mid('m1'), op, compensation)
      }

      expect(jc1.buildJournal().semanticJournalHash).toBe(jc2.buildJournal().semanticJournalHash)
    })

    it('auditJournalHash differs with different timestamps', () => {
      let t1 = 0
      const clock1 = () => `2024-01-01T00:00:0${t1++}.000Z` as IsoTimestamp
      let t2 = 100
      const clock2 = () => `2024-06-15T12:34:5${t2++}.000Z` as IsoTimestamp

      const jc1 = new JournalCoordinator(execId, planId, authId, clock1)
      const jc2 = new JournalCoordinator(execId, planId, authId, clock2)

      for (const jc of [jc1, jc2]) {
        jc.prepareMutation(aid('a1'), mid('m1'), op, classification)
        jc.startMutation(aid('a1'), mid('m1'), op)
        jc.recordSuccess(aid('a1'), mid('m1'), op, compensation)
      }

      expect(jc1.buildJournal().auditJournalHash).not.toBe(jc2.buildJournal().auditJournalHash)
    })

    it('semanticJournalHash unchanged with different executionId', () => {
      const jc1 = new JournalCoordinator('exec-A' as ProvisioningExecutionId, planId, authId, clock)
      const jc2 = new JournalCoordinator('exec-B' as ProvisioningExecutionId, planId, authId, clock)

      // Reset ticks for deterministic timestamps in both
      ticks = 0
      const fixedClock = () => '2024-01-01T00:00:00.000Z' as IsoTimestamp

      const jcA = new JournalCoordinator('exec-A' as ProvisioningExecutionId, planId, authId, fixedClock)
      const jcB = new JournalCoordinator('exec-B' as ProvisioningExecutionId, planId, authId, fixedClock)

      for (const jc of [jcA, jcB]) {
        jc.prepareMutation(aid('a1'), mid('m1'), op, classification)
        jc.startMutation(aid('a1'), mid('m1'), op)
        jc.recordSuccess(aid('a1'), mid('m1'), op, compensation)
      }

      expect(jcA.buildJournal().semanticJournalHash).toBe(jcB.buildJournal().semanticJournalHash)
    })
  })

  describe('validation events', () => {
    it('recordValidationStarted/Succeeded append correct events', () => {
      const jc = makeCoordinator()
      jc.recordValidationStarted(aid('a1'), mid('m1'), 'digest-check')
      jc.recordValidationSucceeded(aid('a1'), mid('m1'), 'digest-check')
      const { entries } = jc.buildJournal()
      expect(entries[0].event).toBe('validation-started')
      expect(entries[1].event).toBe('validation-succeeded')
      if (entries[0].event === 'validation-started') {
        expect(entries[0].validationKind).toBe('digest-check')
      }
    })

    it('recordValidationFailed appends validation-failed entry', () => {
      const jc = makeCoordinator()
      jc.recordValidationFailed(
        aid('a1'), mid('m1'), 'digest-check',
        [diagCode('DIGEST_MISMATCH')], [diagId('diag-99')],
      )
      const { entries } = jc.buildJournal()
      expect(entries[0].event).toBe('validation-failed')
      if (entries[0].event === 'validation-failed') {
        expect(entries[0].diagnosticCodes).toEqual(['DIGEST_MISMATCH'])
        expect(entries[0].diagnosticIds).toEqual(['diag-99'])
        expect(entries[0].quarantinedArtifactRecord).toBeUndefined()
      }
    })

    it('ValidationFailedEntry carries quarantineRecord when provided', () => {
      const jc = makeCoordinator()
      const qr: QuarantinedArtifactRecord = {
        diagnosticId: diagId('diag-1'),
        artifactAuthorizationId: 'art-auth-1' as ArtifactAuthorizationId,
        quarantineHandle: {
          quarantinePath: '/q/path' as QuarantinePath,
          artifactAuthorizationId: 'art-auth-1' as ArtifactAuthorizationId,
        } as QuarantinedArtifactHandle,
        reason: 'digest-mismatch',
        retentionPolicy: 'retain-until-cleanup',
        quarantinedAt: '2024-01-01T00:00:00.000Z' as IsoTimestamp,
      }
      jc.recordValidationFailed(
        aid('a1'), mid('m1'), 'digest-check',
        [diagCode('DIGEST_MISMATCH')], [diagId('diag-1')],
        qr,
      )
      const { entries } = jc.buildJournal()
      if (entries[0].event === 'validation-failed') {
        expect(entries[0].quarantinedArtifactRecord).toBe(qr)
      }
    })
  })
})
