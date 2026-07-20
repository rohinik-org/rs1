import { randomUUID } from 'node:crypto'
import type { DriverEvent, ExecutionResult, ExecutionContext, JsonSerializable } from '@rohinik-org/capability-manifest'
import { DriverErrorCode, makeDriverError } from '@rohinik-org/capability-manifest'
import type { ExecutionDispatcher } from './execution-dispatcher.js'

export class CapabilityExecutor {
  constructor(private readonly dispatcher: ExecutionDispatcher) {}

  async execute<T extends JsonSerializable>(
    capabilityId: string,
    input: unknown,
    context: ExecutionContext
  ): Promise<ExecutionResult<T>> {
    const startedAt = new Date()
    let value: T | undefined = undefined
    let driverId = ''

    for await (const event of this.dispatcher.dispatch<T>(capabilityId, input, context)) {
      driverId = event.driverId

      if (event.type === 'RESULT') {
        value = event.payload as T
      } else if (event.type === 'ERROR') {
        throw event.payload
      }
    }

    const completedAt = new Date()
    return {
      requestId: context.requestId,
      executionId: context.executionId,
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
