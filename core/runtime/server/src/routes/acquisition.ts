import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { RuntimeHost } from '@rohinik-org/runtime'

export function registerAcquisitionRoutes(app: FastifyInstance, host: RuntimeHost): void {
  function ready(): boolean {
    return host.state === 'READY' || host.state === 'DEGRADED'
  }

  app.get('/v1/acquisition/sources', async (_req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const sources = host.sourceRegistry.list().map(s => ({ sourceId: s.sourceId, sourceType: s.sourceType }))
    reply.send({ requestId: randomUUID(), sources })
  })

  app.post('/v1/acquisition/search', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const body = req.body as { term?: string; version?: string }
    const candidates = await host.acquisition.search({ term: body.term ?? '', version: body.version })
    reply.send({ requestId: randomUUID(), candidates })
  })

  app.post('/v1/acquisition/plan', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const body = req.body as { term?: string; policy?: unknown }
    const candidates = await host.acquisition.search({ term: body.term ?? '' })
    if (candidates.length === 0) return reply.send({ requestId: randomUUID(), plan: null, reason: 'no candidates found' })
    const plan = await host.acquisition.plan(candidates[0], body.policy as never)
    reply.send({ requestId: randomUUID(), plan })
  })

  app.post('/v1/acquisition/install', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const body = req.body as { term?: string; policy?: unknown }
    const candidates = await host.acquisition.search({ term: body.term ?? '' })
    if (candidates.length === 0) return reply.send({ requestId: randomUUID(), success: false, reason: 'no candidates found' })
    const plan = await host.acquisition.plan(candidates[0], body.policy as never)
    const result = await host.acquisition.install(plan, { requestId: randomUUID(), term: body.term ?? '', policy: body.policy as never })
    reply.send(result)
  })

  app.delete('/v1/acquisition/install/:capabilityId', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const { capabilityId } = req.params as { capabilityId: string }
    const success = host.installedCapabilities.unregister(capabilityId)
    reply.send({ requestId: randomUUID(), success, capabilityId })
  })

  app.get('/v1/acquisition/installed', async (_req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const installed = host.installedCapabilities.list()
    reply.send({ requestId: randomUUID(), installed })
  })

  app.get('/v1/acquisition/installed/:capabilityId', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const { capabilityId } = req.params as { capabilityId: string }
    const cap = host.installedCapabilities.get(capabilityId)
    if (!cap) return reply.status(404).send({ code: 'NOT_FOUND', capabilityId })
    reply.send({ requestId: randomUUID(), capability: cap })
  })
}
