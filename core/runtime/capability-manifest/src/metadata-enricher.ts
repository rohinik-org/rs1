import type { DriverRawEvent } from './driver-raw-event.js'
import type { DriverEvent } from './driver-event.js'
import type { ExecutionContext } from './execution-context.js'

export interface Clock {
  now(): Date
}

const DEFAULT_CLOCK: Clock = { now: () => new Date() }

// ponytail: enriches only — never validates; sequence is monotonic yield-order
export class MetadataEnricher {
  private readonly clock: Clock

  constructor(clock: Clock = DEFAULT_CLOCK) {
    this.clock = clock
  }

  enrich<T>(
    source: AsyncIterable<DriverRawEvent<T>>,
    context: ExecutionContext,
    driverId: string
  ): AsyncIterable<DriverEvent<T>> {
    const clock = this.clock
    return {
      [Symbol.asyncIterator]() {
        const iter = source[Symbol.asyncIterator]()
        let sequence = 0

        return {
          async next(): Promise<IteratorResult<DriverEvent<T>>> {
            const result = await iter.next()
            if (result.done) return { done: true, value: undefined as unknown as DriverEvent<T> }

            const base = {
              requestId: context.requestId,
              executionId: context.executionId,
              driverId,
              sequence: ++sequence,
              timestamp: clock.now(),
            }

            return {
              done: false,
              value: { ...base, ...result.value } as DriverEvent<T>,
            }
          }
        }
      }
    }
  }
}
