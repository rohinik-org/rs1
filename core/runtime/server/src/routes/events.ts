import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'

export function registerEventsRoute(app: FastifyInstance): void {
  app.get('/v1/events', async (_req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })
    const interval = setInterval(() => {
      reply.raw.write(`event: heartbeat\ndata: ${JSON.stringify({ requestId: randomUUID(), ts: Date.now() })}\n\n`)
    }, 15_000)
    reply.raw.on('close', () => clearInterval(interval))
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ requestId: randomUUID(), message: 'Rohinik event stream connected' })}\n\n`)
  })
}
