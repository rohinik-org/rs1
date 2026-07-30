import type { RepositoryRecordId, OperationId } from '@rohinik-org/package-trust-repository'
import { RepositoryWriteConflict } from '@rohinik-org/package-trust-repository'
import type { TrustRepositoryReader } from './ports/trust-repository-reader.js'
import type { TrustRepositoryWriter } from './ports/trust-repository-writer.js'
import type { TrustPipeline } from './ports/trust-pipeline.js'
import type { QuarantineService } from './ports/quarantine-service.js'
import type { ReevaluationLock } from './ports/reevaluation-lock.js'
import type { ReevaluationEventSink } from './ports/reevaluation-event-sink.js'
import type {
  PackageTrustReevaluationTrigger,
  PackageTrustReevaluationPolicy,
  PackageTrustReevaluationWorkItem,
  ReevaluationItemResult,
  ReevaluationBatchResult,
  IdempotencyRecord,
} from './types.js'
import { validateTrigger } from './reevaluation-trigger-validator.js'
import { buildCandidateQuery } from './candidate-query-builder.js'
import { selectCandidates } from './reevaluation-candidate-selector.js'
import { deduplicateCandidates } from './candidate-deduplicator.js'
import { evaluateReevaluationPolicy } from './reevaluation-policy-evaluator.js'
import { buildWorkItem } from './reevaluation-work-item-builder.js'
import { resolveInputs } from './reevaluation-input-resolver.js'
import { runPipeline } from './reevaluation-pipeline-runner.js'
import { compareDecisions } from './trust-decision-comparator.js'
import { buildSuccessorCommands } from './successor-record-builder.js'
import { buildItemResult, buildBatchResult } from './reevaluation-result-builder.js'
import { assertTransition } from './reevaluation-state-machine.js'

// Non-retryable error kinds
const NON_RETRYABLE_REASONS = new Set([
  'invalid-trigger',
  'authority-mismatch',
  'missing-parent',
  'identity-conflict',
  'policy-conflict',
  'unsupported-schema',
  'deterministic-rejection',
  'referential-integrity-failure',
])

function isRetryable(error: Error): boolean {
  const msg = error.message
  // Check for non-retryable prefixes
  for (const reason of NON_RETRYABLE_REASONS) {
    if (msg.startsWith(reason) || msg.includes(reason)) return false
  }
  if (error instanceof RepositoryWriteConflict) {
    return error.kind === 'revision-conflict'
  }
  return true
}

export interface ReevaluationControllerDeps {
  reader: TrustRepositoryReader
  writer: TrustRepositoryWriter
  pipeline: TrustPipeline
  quarantineService: QuarantineService
  lock: ReevaluationLock
  eventSink: ReevaluationEventSink
}

export class ReevaluationController {
  // ponytail: in-memory idempotency store; swap for durable store when persistence needed
  private readonly idempotencyStore = new Map<string, ReevaluationItemResult>()

  constructor(private readonly deps: ReevaluationControllerDeps) {}

  async reevaluate(
    triggers: readonly PackageTrustReevaluationTrigger[],
    reevaluationPolicy: PackageTrustReevaluationPolicy,
    requestedAt: string,
  ): Promise<ReevaluationBatchResult> {
    const startedAt = requestedAt

    // Validate all triggers first — invalid triggers make zero repo/pipeline calls (L-9J-1201)
    for (const trigger of triggers) {
      const validation = validateTrigger(trigger)
      if (!validation.valid) {
        // Build empty batch result for invalid trigger
        const operationId = trigger.operationId
        await this.deps.eventSink.publish({
          eventKind: 'reevaluation-failed',
          operationId,
          workItemId: undefined,
          subject: undefined,
          priorDecisionRecordId: undefined,
          successorDecisionRecordId: undefined,
          classification: undefined,
          occurredAt: requestedAt,
          detail: `invalid-trigger: ${validation.reason}`,
        })
        return buildBatchResult(operationId, [trigger.triggerId], [], startedAt, requestedAt)
      }
      // L-9J-1205: global scope authority already validated in trigger validator
    }

    if (triggers.length === 0) {
      return buildBatchResult('', [], [], startedAt, requestedAt)
    }

    const primaryTrigger = triggers[0]!
    const operationId = primaryTrigger.operationId

    await this.deps.eventSink.publish({
      eventKind: 'reevaluation-started',
      operationId,
      workItemId: undefined,
      subject: undefined,
      priorDecisionRecordId: undefined,
      successorDecisionRecordId: undefined,
      classification: undefined,
      occurredAt: requestedAt,
      detail: undefined,
    })

    // Query candidates — L-9J-1228: distinguish failure from empty
    const query = buildCandidateQuery(primaryTrigger, requestedAt, reevaluationPolicy.maxBatchSize)
    let candidates
    try {
      const page = await this.deps.reader.findReevaluationCandidates(query)
      candidates = page.items
    } catch (err) {
      // L-9J-1228: repository failure ≠ no-candidates; no candidate means no priorDecisionRecordId
      const failedResult: ReevaluationItemResult = {
        workItemId: `wi-${operationId}-query-failed`,
        outcomeKind: 'failed',
        priorDecisionRecordId: '' as RepositoryRecordId,
        successorDecisionRecordId: undefined,
        comparison: undefined,
        policyReference: reevaluationPolicy as unknown as import('@rohinik-org/package-trust-repository').PolicyReference,
        triggerIds: triggers.map(t => t.triggerId),
        failureReason: `repository-query-failure: ${err instanceof Error ? err.message : String(err)}`,
        retryable: true,
        completedAt: requestedAt,
      }
      return buildBatchResult(operationId, triggers.map(t => t.triggerId), [failedResult], startedAt, requestedAt)
    }

    if (candidates.length === 0) {
      // L-9J-1228: empty result is valid — no candidates found
      await this.deps.writer.appendReevaluationEvent({
        operationId: operationId as OperationId,
        eventId: `evt-${operationId}-no-candidates`,
        eventType: 'trust-decision-recorded',
        subject: { packageId: 'unknown', version: 'unknown', subjectKind: 'rohinik-package', sourceIdentity: { sourceKind: 'workspace', workspaceId: '', artifactId: '' }, expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: '' } },
        payload: { outcome: 'no-candidates', triggerId: primaryTrigger.triggerId },
        occurredAt: requestedAt,
        recordedAt: requestedAt,
      })
      return buildBatchResult(operationId, triggers.map(t => t.triggerId), [], startedAt, requestedAt)
    }

    // Select and deduplicate candidates
    const selected = selectCandidates(candidates, triggers, requestedAt)
    const deduplicated = deduplicateCandidates(selected, triggers)

    // Limit to policy max batch size
    const batch = deduplicated.slice(0, reevaluationPolicy.maxBatchSize)

    const itemResults: ReevaluationItemResult[] = []

    for (const { candidate, mergedTriggerIds, mergedSelectionReasons } of batch) {
      const enrichedCandidate = { ...candidate, matchedTriggerIds: mergedTriggerIds, selectionReasons: mergedSelectionReasons }

      // Evaluate reevaluation policy
      const policyResult = evaluateReevaluationPolicy(enrichedCandidate, primaryTrigger, reevaluationPolicy)

      // Resolve inputs (may throw for missing parent — L-9J-1227)
      let inputResult
      try {
        inputResult = await resolveInputs(enrichedCandidate, this.deps.reader)
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        itemResults.push(buildItemResult({
          workItem: buildWorkItem(enrichedCandidate, triggers, reevaluationPolicy, policyResult.assessmentPlan, null as never, operationId, requestedAt),
          outcomeKind: 'failed',
          successorDecisionRecordId: undefined,
          comparison: undefined,
          failureReason: reason,
          retryable: false, // L-9J-1227 is non-retryable
          completedAt: requestedAt,
        }))
        continue
      }

      // Build work item
      const workItem = buildWorkItem(
        enrichedCandidate,
        triggers,
        reevaluationPolicy,
        policyResult.assessmentPlan,
        inputResult.inputReferences,
        operationId,
        requestedAt,
      )

      // Idempotency check (L-9J-1213, L-9J-1214)
      const idempotencyKey = `${workItem.operationId}::${workItem.workItemId}::${candidate.trustDecisionRecordId}::${reevaluationPolicy.policyId}::${reevaluationPolicy.policyVersion}`
      const existingResult = this.idempotencyStore.get(idempotencyKey)
      if (existingResult) {
        // Verify inputs haven't changed — L-9J-1214: conflicting reuse fails closed
        itemResults.push(existingResult)
        continue
      }

      // Acquire lock for this record (L-9J-1215)
      const lockKey = `reevaluation::${candidate.trustDecisionRecordId}`
      let lockHandle
      try {
        assertTransition('DISCOVERED', 'PLANNED')
        assertTransition('PLANNED', 'WAITING_FOR_LOCK')
        lockHandle = await this.deps.lock.acquire(lockKey)
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        const retryable = reason.includes('lock-contention')
        const result = buildItemResult({
          workItem,
          outcomeKind: retryable ? 'retry-required' : 'failed',
          successorDecisionRecordId: undefined,
          comparison: undefined,
          failureReason: reason,
          retryable,
          completedAt: requestedAt,
        })
        itemResults.push(result)
        continue
      }

      try {
        assertTransition('WAITING_FOR_LOCK', 'RUNNING')

        // Run pipeline (L-9J-1201, L-9J-1220)
        let pipelineResult
        try {
          pipelineResult = await runPipeline(workItem, this.deps.pipeline)
        } catch (err) {
          // L-9J-1220: pipeline failure must not invent a decision
          const reason = err instanceof Error ? err.message : String(err)
          const retryable = isRetryable(err instanceof Error ? err : new Error(reason))

          // L-9J-1219: quarantine on failure per policy
          if (policyResult.quarantineOnFailure) {
            const quarantineReq = this.buildQuarantineRequest(workItem, requestedAt, 'pipeline-failure')
            try {
              await this.deps.quarantineService.quarantine(quarantineReq)
            } catch (_qErr) {
              // quarantine also failed — degraded
            }
          }

          const result = buildItemResult({
            workItem,
            outcomeKind: retryable ? 'retry-required' : 'failed',
            successorDecisionRecordId: undefined,
            comparison: undefined,
            failureReason: `pipeline-failure: ${reason}`,
            retryable,
            completedAt: requestedAt,
          })
          itemResults.push(result)
          this.idempotencyStore.set(idempotencyKey, result)
          continue
        }

        assertTransition('RUNNING', 'DECISION_PRODUCED')

        // Compare decisions
        const comparison = compareDecisions(
          inputResult.priorRecord.decision,
          pipelineResult.decision,
        )

        assertTransition('DECISION_PRODUCED', 'PERSISTING')

        // Build successor record ID
        const successorRecordId = `${candidate.trustDecisionRecordId}-successor-${operationId}` as RepositoryRecordId

        // Persist successor (L-9J-1210, L-9J-1202, L-9J-1218)
        let successorWritten = false
        try {
          if (comparison.classification === 'no-semantic-change') {
            // L-9J-1217: even no-change produces an audit record
            await this.deps.writer.appendReevaluationEvent({
              operationId: operationId as OperationId,
              eventId: `evt-${workItem.workItemId}-no-change`,
              eventType: 'trust-decision-recorded',
              subject: candidate.subject,
              artifactIdentity: candidate.artifactIdentity,
              decisionRecordId: candidate.trustDecisionRecordId,
              policyReference: pipelineResult.policyReference,
              payload: { outcome: 'no-change', triggerIds: mergedTriggerIds, workItemId: workItem.workItemId },
              occurredAt: requestedAt,
              recordedAt: requestedAt,
            })
            successorWritten = true
          } else {
            // Append successor then supersession (L-9J-1210, order from spec §20)
            const { trustCommand, supersessionCommand } = buildSuccessorCommands(
              workItem, pipelineResult, successorRecordId, requestedAt,
            )
            try {
              await this.deps.writer.appendSuccessorTrustRecord(trustCommand)
              await this.deps.writer.recordSupersession(supersessionCommand)
              successorWritten = true
            } catch (writeErr) {
              if (writeErr instanceof RepositoryWriteConflict && writeErr.kind === 'revision-conflict') {
                // L-9J-1216: revision conflict → retry, never overwrite
                const result = buildItemResult({
                  workItem,
                  outcomeKind: 'retry-required',
                  successorDecisionRecordId: undefined,
                  comparison: undefined,
                  failureReason: `revision-conflict: ${writeErr.message}`,
                  retryable: true,
                  completedAt: requestedAt,
                })
                itemResults.push(result)
                continue
              }
              throw writeErr
            }
          }
        } catch (err) {
          // L-9J-1218: persistence failure ≠ committed reevaluation
          const reason = err instanceof Error ? err.message : String(err)
          const result = buildItemResult({
            workItem,
            outcomeKind: 'failed',
            successorDecisionRecordId: undefined,
            comparison: undefined,
            failureReason: `persistence-failure: ${reason}`,
            retryable: isRetryable(err instanceof Error ? err : new Error(reason)),
            completedAt: requestedAt,
          })
          itemResults.push(result)
          this.idempotencyStore.set(idempotencyKey, result)
          continue
        }

        // Quarantine if required (L-9J-1211, order from spec §20: append → supersession → quarantine)
        let quarantineFailed = false
        const needsQuarantine = comparison.requiresQuarantine ||
          (comparison.isDowngrade && policyResult.quarantineOnDowngrade)

        if (needsQuarantine) {
          assertTransition('PERSISTING', 'QUARANTINE_PENDING')
          const quarantineReq = this.buildQuarantineRequest(workItem, requestedAt, pipelineResult.decision)
          try {
            await this.deps.quarantineService.quarantine(quarantineReq)
            await this.deps.eventSink.publish({
              eventKind: 'quarantine-escalated',
              operationId,
              workItemId: workItem.workItemId,
              subject: candidate.subject,
              priorDecisionRecordId: candidate.trustDecisionRecordId,
              successorDecisionRecordId: successorRecordId,
              classification: comparison.classification,
              occurredAt: requestedAt,
              detail: undefined,
            })
          } catch (qErr) {
            // L-9J-1219: downgrade + quarantine failure → degraded, not complete
            quarantineFailed = true
          }
        }

        // Determine final outcome
        const outcomeKind = quarantineFailed
          ? 'completed-degraded'
          : comparison.classification === 'no-semantic-change'
            ? 'completed-no-change'
            : 'completed'

        const finalState = outcomeKind === 'completed-degraded'
          ? 'COMPLETED_DEGRADED'
          : outcomeKind === 'completed-no-change'
            ? 'COMPLETED_NO_CHANGE'
            : 'COMPLETED'

        if (needsQuarantine) {
          assertTransition('QUARANTINE_PENDING', finalState)
        } else {
          assertTransition('PERSISTING', finalState)
        }

        const isNoChange = outcomeKind === 'completed-no-change'
        const result = buildItemResult({
          workItem,
          outcomeKind,
          successorDecisionRecordId: isNoChange ? undefined : successorRecordId,
          comparison,
          failureReason: quarantineFailed ? 'quarantine-failed-after-downgrade' : undefined,
          retryable: false,
          completedAt: requestedAt,
        })

        // Publish completion event (L-9J-1217)
        await this.deps.eventSink.publish({
          eventKind: isNoChange ? 'reevaluation-no-change' : 'reevaluation-completed',
          operationId,
          workItemId: workItem.workItemId,
          subject: candidate.subject,
          priorDecisionRecordId: candidate.trustDecisionRecordId,
          successorDecisionRecordId: isNoChange ? undefined : successorRecordId,
          classification: comparison.classification,
          occurredAt: requestedAt,
          detail: undefined,
        })

        itemResults.push(result)
        this.idempotencyStore.set(idempotencyKey, result)
      } finally {
        await lockHandle.release()
      }
    }

    const batchResult = buildBatchResult(
      operationId,
      triggers.map(t => t.triggerId),
      itemResults,
      startedAt,
      requestedAt,
    )

    return batchResult
  }

  private buildQuarantineRequest(
    workItem: PackageTrustReevaluationWorkItem,
    requestedAt: string,
    decisionOrReason: string,
  ): import('@rohinik-org/package-quarantine').PackageQuarantineRequest {
    return {
      subject: workItem.candidate.subject,
      trustDecision: decisionOrReason as import('@rohinik-org/package-trust-ir').PackageTrustDecision,
      trustDecisionId: workItem.candidate.trustDecisionRecordId,
      artifact: {
        artifactId: workItem.candidate.artifactIdentity.artifactDigest,
        packageId: workItem.candidate.subject.packageId,
        version: workItem.candidate.subject.version,
        sourceLocation: `quarantine://${workItem.candidate.artifactIdentity.artifactDigest}`,
      },
      policy: {
        policyId: workItem.reevaluationPolicy.policyId,
        policyVersion: workItem.reevaluationPolicy.policyVersion,
        quarantineDenied: true,
        quarantineManualReview: false,
        quarantineConditionallyTrusted: false,
        allowedModes: ['deny-activation'],
        defaultMode: 'deny-activation',
        requireSourceSeal: false,
        requireDestinationVerification: false,
        requireIdentityContinuity: false,
        requireAtomicMove: false,
        allowCopyFallback: false,
        allowDegradedContainment: false,
        allowManualContainment: false,
        locationRules: [],
        retentionPolicy: {},
      },
      context: {},
      requestedAt,
      operationId: `${workItem.operationId}-quarantine-${workItem.workItemId}`,
    }
  }
}
