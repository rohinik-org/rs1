import type { ArtifactStorage } from './ports/artifact-storage.js'
import type { QuarantineStorage } from './ports/quarantine-storage.js'
import type { QuarantineLock, QuarantineLockHandle } from './ports/quarantine-lock.js'
import type { QuarantineEventSink } from './ports/quarantine-event-sink.js'
import type {
  QuarantineContainmentPlan,
  PackageQuarantineRequest,
  StorageReceipt,
} from './types.js'

export interface ExecutionResult {
  readonly success: boolean
  readonly receipts: readonly StorageReceipt[]
  readonly failureReason?: string
  readonly partial: boolean
  readonly lockedUntil?: string
}

export class QuarantineExecutor {
  constructor(
    private readonly artifactStorage: ArtifactStorage,
    private readonly quarantineStorage: QuarantineStorage,
    private readonly lock: QuarantineLock,
    private readonly eventSink: QuarantineEventSink,
  ) {}

  async execute(plan: QuarantineContainmentPlan, request: PackageQuarantineRequest): Promise<ExecutionResult> {
    const receipts: StorageReceipt[] = []
    let lockHandle: QuarantineLockHandle | undefined
    const lockKey = plan.operationId
    let destinationVerified = false
    let sourceDeleted = false

    // Emit start event (failure here is non-fatal)
    await this.safeEmit({
      eventKind: 'quarantine-started',
      operationId: plan.operationId,
      subject: plan.subject,
      occurredAt: request.requestedAt,
    })

    for (const planStep of plan.steps) {
      try {
        switch (planStep.step) {
          case 'acquire-lock': {
            lockHandle = await this.lock.acquire(lockKey)
            break
          }
          case 'validate-source': {
            const stat = await this.artifactStorage.stat(plan.sourceLocation)
            if (!stat.exists) throw new Error(`Source artifact not found: ${plan.sourceLocation}`)
            break
          }
          case 'seal-source': {
            const receipt = await this.artifactStorage.seal(plan.sourceLocation)
            receipts.push(receipt)
            break
          }
          case 'create-namespace': {
            if (!plan.destinationLocation) throw new Error('create-namespace requires destinationLocation')
            const ns = await this.quarantineStorage.resolveNamespace({
              packageId: plan.subject.packageId,
              version: plan.subject.version,
              operationId: plan.operationId,
            })
            const receipt = await this.quarantineStorage.createNamespace(ns)
            receipts.push(receipt)
            break
          }
          case 'copy-artifact': {
            if (!plan.destinationLocation) throw new Error('copy-artifact requires destinationLocation')
            const receipt = await this.artifactStorage.copy(plan.sourceLocation, plan.destinationLocation)
            receipts.push(receipt)
            // Quarantine destination must never be activatable (L-9J-1013)
            const deactivateReceipt = await this.artifactStorage.removeActivationReference(plan.destinationLocation)
            receipts.push(deactivateReceipt)
            break
          }
          case 'move-artifact': {
            if (!plan.destinationLocation) throw new Error('move-artifact requires destinationLocation')
            // L-9J-1007: only mark deleted after verify-destination succeeds
            // We do the move here but flag it as sourceDeleted
            const receipt = await this.artifactStorage.move(plan.sourceLocation, plan.destinationLocation)
            receipts.push(receipt)
            sourceDeleted = true
            // Quarantine destination must never be activatable (L-9J-1013)
            const deactivateReceipt = await this.artifactStorage.removeActivationReference(plan.destinationLocation)
            receipts.push(deactivateReceipt)
            break
          }
          case 'verify-destination': {
            const dest = plan.destinationLocation ?? plan.sourceLocation
            const stat = await this.artifactStorage.stat(dest)
            if (!stat.exists) throw new Error(`Destination artifact not found after containment: ${dest}`)
            destinationVerified = true
            receipts.push({ operation: 'verify-destination', reference: dest, completedAt: request.requestedAt })
            break
          }
          case 'remove-activation-reference': {
            const receipt = await this.artifactStorage.removeActivationReference(plan.sourceLocation)
            receipts.push(receipt)
            break
          }
          case 'record-result':
            // Recording is done by the controller after building the result
            receipts.push({ operation: 'record-result', reference: plan.operationId, completedAt: request.requestedAt })
            break
          case 'release-lock': {
            if (lockHandle) {
              await lockHandle.release()
              lockHandle = undefined
            }
            break
          }
        }
      } catch (err) {
        const failureReason = err instanceof Error ? err.message : String(err)
        if (planStep.required) {
          // L-9J-1016: fail closed on required step failure
          // L-9J-1007: if source was moved but verify-destination didn't succeed, that's a partial failure
          if (sourceDeleted && !destinationVerified) {
            // partial: source gone, dest not verified — manual intervention needed
            if (lockHandle) await lockHandle.release().catch(() => undefined)
            await this.safeEmit({ eventKind: 'quarantine-failed', operationId: plan.operationId, subject: plan.subject, occurredAt: request.requestedAt })
            return { success: false, receipts, failureReason: `Partial: source moved but destination unverified — ${failureReason}`, partial: true }
          }
          if (lockHandle) await lockHandle.release().catch(() => undefined)
          await this.safeEmit({ eventKind: 'quarantine-failed', operationId: plan.operationId, subject: plan.subject, occurredAt: request.requestedAt })
          return { success: false, receipts, failureReason, partial: false }
        }
        // Non-required step failure → degraded
        receipts.push({ operation: `failed:${planStep.step}`, reference: plan.sourceLocation, completedAt: request.requestedAt })
        await this.safeEmit({ eventKind: 'quarantine-degraded', operationId: plan.operationId, subject: plan.subject, occurredAt: request.requestedAt })
      }
    }

    if (lockHandle) {
      await lockHandle.release().catch(() => undefined)
      lockHandle = undefined
    }

    await this.safeEmit({ eventKind: 'quarantine-completed', operationId: plan.operationId, subject: plan.subject, outcome: 'quarantined', occurredAt: request.requestedAt })
    return { success: true, receipts, partial: false }
  }

  private async safeEmit(event: Parameters<QuarantineEventSink['publish']>[0]): Promise<void> {
    try { await this.eventSink.publish(event) } catch { /* ponytail: event failure is non-fatal */ }
  }
}
