import type { FastifyInstance } from 'fastify'
import {
  PublicErrorCode,
  EXECUTION_PROTOCOL_VERSION,
  type PublicErrorEnvelope,
} from '@rohinik-org/execution-protocol-v1'
import type { ExecutionCursor } from '@rohinik-org/execution-protocol-v1'
import { EventStoreError, type IAsyncExecutionEventStore } from '@rohinik-org/async-execution-event-store'
import { asyncRepo } from './async-executions.js'

function notFound(executionId: string): PublicErrorEnvelope {
  return {
    code: PublicErrorCode.EXECUTION_NOT_FOUND,
    message: `Execution ${executionId} not found`,
    executionId,
    protocolVersion: EXECUTION_PROTOCOL_VERSION,
  }
}

export function registerExecutionEventsRoute(
  app: FastifyInstance,
  eventStore: IAsyncExecutionEventStore,
): void {
  /**
   * GET /v1/executions/:executionId/events[?after=cursor]
   *
   * SSE stream of StoredExecutionEvents for one execution.
   * - No cursor: replay all history then stream live events.
   * - ?after=cursor: replay only events after that cursor, then stream live.
   * - Stream closes after terminal event is delivered.
   * - Client disconnect does NOT cancel the execution.
   */
  app.get<{
    Params: { executionId: string }
    Querystring: { after?: string }
  }>('/v1/executions/:executionId/events', async (req, reply) => {
    const { executionId } = req.params
    const afterCursor = req.query.after as ExecutionCursor | undefined

    // Validate execution exists before opening the stream
    const record = await asyncRepo.findById(executionId)
    if (!record) {
      reply.code(404).send(notFound(executionId))
      return
    }

    // Validate cursor belongs to this execution before opening stream
    if (afterCursor !== undefined) {
      try {
        // listAfter validates cursor ownership; empty result is fine
        await eventStore.listAfter(executionId, afterCursor)
      } catch (err) {
        if (err instanceof EventStoreError) {
          reply.code(400).send({
            code: PublicErrorCode.INVALID_REQUEST,
            message: err.message,
            protocolVersion: EXECUTION_PROTOCOL_VERSION,
          })
          return
        }
        throw err
      }
    }

    reply.raw.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    // Track whether client disconnected — used to stop writing but NOT to cancel execution
    let clientGone = false
    reply.raw.on('close', () => { clientGone = true })

    function write(event: unknown): void {
      if (!clientGone) {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      }
    }

    // If cursor provided, skip replayed history up to that point
    // subscribe() always replays from the beginning; we filter after subscribe
    // by sequence number decoded from cursor
    let afterSequence = 0
    if (afterCursor !== undefined) {
      try {
        const { decodeExecutionCursor } = await import('@rohinik-org/execution-protocol-v1')
        afterSequence = decodeExecutionCursor(afterCursor).sequence
      } catch {
        // cursor already validated above; safe to ignore decode errors here
      }
    }

    // subscribe() replays history then delivers live events, closes on terminal
    for await (const event of eventStore.subscribe(executionId)) {
      if (event.sequence <= afterSequence) continue
      write(event)
    }

    // Stream ended (terminal event reached or store closed)
    if (!clientGone) {
      reply.raw.end()
    }
  })
}
