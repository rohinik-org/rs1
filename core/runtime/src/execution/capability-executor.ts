import { randomUUID } from 'node:crypto'
import type { DriverEvent, ExecutionResult, ExecutionContext, JsonSerializable } from '@rohinik-org/capability-manifest'
import { DriverErrorCode, makeDriverError } from '@rohinik-org/capability-manifest'
import type { ExecutionDispatcher } from './execution-dispatcher.js'
import type { ExecutionEvidenceService } from '@rohinik-org/execution-evidence-ir'
import {
  intelligentExecutionId,
  executionSessionId,
  EvidenceOutcome,
} from '@rohinik-org/execution-evidence-ir'

export class CapabilityExecutor {
  constructor(
    private readonly dispatcher:      ExecutionDispatcher,
    private readonly evidenceService?: ExecutionEvidenceService,
  ) {}

  async execute<T extends JsonSerializable>(
    capabilityId: string,
    input: unknown,
    context: ExecutionContext
  ): Promise<ExecutionResult<T>> {
    const startedAt = new Date()

    const evidenceId = this.evidenceService?.open({
      intelligentExecutionId: intelligentExecutionId(context.executionId || randomUUID()),
      executionSessionId:     executionSessionId(context.sessionId || randomUUID()),
      operationKind:          `capability.${capabilityId}`,
    })

    let value: T | undefined = undefined
    let driverId = ''
    let failed = false
    let failError: unknown

    try {
      for await (const event of this.dispatcher.dispatch<T>(capabilityId, input, context)) {
        driverId = event.driverId

        if (event.type === 'RESULT') {
          value = event.payload as T
        } else if (event.type === 'ERROR') {
          failed = true
          failError = event.payload
        }
      }
    } catch (err) {
      failed = true
      failError = err
    }

    if (evidenceId && this.evidenceService) {
      await this.evidenceService.sealAndStore(
        evidenceId,
        failed ? EvidenceOutcome.FAILURE : EvidenceOutcome.SUCCESS,
        new Date(),
      )
    }

    if (failed) {
      throw failError
    }

    const completedAt = new Date()
    return {
      requestId:    context.requestId,
      executionId:  context.executionId,
      driverId,
      capabilityId,
      value,
      startedAt,
      completedAt,
      durationMs: Math.round(completedAt.getTime() - startedAt.getTime()),
    }
  }

  executeStream<T>(
    capabilityId: string,
    input: unknown,
    context: ExecutionContext
  ): AsyncIterable<DriverEvent<T>> {
    return this.dispatcher.dispatch<T>(capabilityId, input, context)
  }
}
