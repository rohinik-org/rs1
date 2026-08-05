import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { RuntimeHost } from '@rohinik-org/runtime'

export function registerKnowledgeRoutes(app: FastifyInstance, host: RuntimeHost): void {
  function ready(): boolean {
    return host.state === 'READY' || host.state === 'DEGRADED'
  }

  app.post('/v1/knowledge/extract', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const body = req.body as { path?: string; content?: string }
    const fragment = await host.knowledge.extract(body.path ?? '', body.content ?? '')
    reply.send({ requestId: randomUUID(), fragment })
  })

  app.post('/v1/knowledge/query', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const body = req.body as { primitive?: unknown; kind?: unknown; label?: string; relationship?: unknown }
    const result = await host.knowledge.query({
      primitive: body.primitive as never,
      kind: body.kind as never,
      label: body.label,
      relationship: body.relationship as never,
    })
    reply.send({ requestId: randomUUID(), ...result })
  })

  app.get('/v1/knowledge/entities', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const query = (req.query as Record<string, string | undefined>)
    const entities = await host.knowledge.findEntities({ kind: query.kind as never })
    reply.send({ requestId: randomUUID(), entities })
  })

  app.get('/v1/knowledge/procedures', async (_req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const procedures = await host.knowledge.findProcedures()
    reply.send({ requestId: randomUUID(), procedures })
  })

  app.post('/v1/workflows/discover', async (_req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    // ponytail: WorkflowDiscoveryEngine not wired yet; returns empty set; wire in Stage 9D
    reply.send({ requestId: randomUUID(), candidates: [] })
  })
}
