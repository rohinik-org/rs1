import type { DriverRawEvent } from './driver-raw-event.js'
import { DriverErrorCode, makeDriverError } from './driver-error.js'

type ProtocolState = 'UNSTARTED' | 'RUNNING' | 'TERMINAL'

// ponytail: pure stream transformer — validates lifecycle contract only, never enriches
export class DriverProtocolValidator {
  static validate<T>(source: AsyncIterable<DriverRawEvent<T>>): AsyncIterable<DriverRawEvent<T>> {
    return {
      [Symbol.asyncIterator]() {
        const iter = source[Symbol.asyncIterator]()
        let state: ProtocolState = 'UNSTARTED'
        let resultSeen = false
        const queue: DriverRawEvent<T>[] = []
        let done = false

        function violation(msg: string): IteratorResult<DriverRawEvent<T>> {
          state = 'TERMINAL'
          return {
            done: false,
            value: {
              type: 'ERROR',
              payload: makeDriverError(DriverErrorCode.PROTOCOL_VIOLATION, msg),
            },
          }
        }

        function processEvent(event: DriverRawEvent<T>): IteratorResult<DriverRawEvent<T>> | null {
          if (state === 'UNSTARTED') {
            if (event.type === 'STARTED') {
              state = 'RUNNING'
              return { done: false, value: event }
            }
            // Driver skipped STARTED — inject synthetic STARTED, queue this event
            state = 'RUNNING'
            queue.push(event)
            return { done: false, value: { type: 'STARTED', payload: {} } as DriverRawEvent<T> }
          }

          if (state === 'TERMINAL') return { done: true, value: undefined as unknown as DriverRawEvent<T> }

          // state === RUNNING
          if (event.type === 'STARTED') return violation('Unexpected second STARTED event')

          if (event.type === 'COMPLETE' || event.type === 'ERROR') {
            state = 'TERMINAL'
            return { done: false, value: event }
          }

          if (event.type === 'RESULT') {
            if (event.payload === undefined || event.payload === null)
              return violation('RESULT payload must not be undefined or null')
            if (resultSeen) return violation('Multiple RESULT events are not allowed')
            resultSeen = true
            return { done: false, value: event }
          }

          if (event.type === 'PROGRESS') {
            const pct = event.payload.percent
            if (!Number.isInteger(pct) || pct < 0 || pct > 100)
              return violation(`PROGRESS.percent must be integer 0–100, got ${pct}`)
          }

          return { done: false, value: event }
        }

        return {
          async next(): Promise<IteratorResult<DriverRawEvent<T>>> {
            if (done) return { done: true, value: undefined as unknown as DriverRawEvent<T> }

            // drain queue first (buffered events from STARTED injection)
            while (queue.length > 0) {
              const evt = queue.shift()!
              const result = processEvent(evt)
              if (result !== null) {
                if (state === 'TERMINAL') done = true
                return result
              }
            }

            if (state === 'TERMINAL') {
              done = true
              return { done: true, value: undefined as unknown as DriverRawEvent<T> }
            }

            const next = await iter.next()
            if (next.done) {
              done = true
              return { done: true, value: undefined as unknown as DriverRawEvent<T> }
            }

            const result2 = processEvent(next.value as DriverRawEvent<T>)
            if (result2 === null) return this.next()
            if ((state as ProtocolState) === 'TERMINAL') done = true
            return result2
          }
        }
      }
    }
  }
}
