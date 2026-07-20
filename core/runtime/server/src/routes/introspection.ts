import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { RuntimeHost } from '@rohinik-org/runtime'

export function registerIntrospectionRoutes(app: FastifyInstance, host: RuntimeHost): void {
  app.get('/v1/capabilities', async (_req, reply) => {
    const capabilities = (host.state === 'READY' || host.state === 'DEGRADED') ? host.runtime.listCapabilities() : []
    reply.send({ requestId: randomUUID(), capabilities })
  })

  app.get('/v1/providers', async (_req, reply) => {
    const providers = (host.state === 'READY' || host.state === 'DEGRADED') ? host.listProviders().map(p => ({
      ...p,
      healthy: p.status === 'HEALTHY',
    })) : []
    reply.send({ requestId: randomUUID(), providers })
  })

  app.get('/v1/extensions', async (_req, reply) => {
    reply.send({ requestId: randomUUID(), extensions: [] })
  })

  app.get('/v1/metrics', async (_req, reply) => {
    if (host.state !== 'READY' && host.state !== 'DEGRADED') {
      return reply.send({ requestId: randomUUID(), counters: {}, histograms: {} })
    }
    const p = host.profile()
    reply.send({
      requestId: randomUUID(),
      uptimeMs: p.uptimeMs,
      capabilities: p.capabilities.length,
      providers: p.providers.filter(pr => pr.status === 'HEALTHY').length,
      diagnostics: p.diagnosticSummary,
    })
  })

  app.get('/v1/diagnostics', async (_req, reply) => {
    if (host.state !== 'READY' && host.state !== 'DEGRADED') {
      return reply.status(503).send({ code: 'NOT_READY', message: 'Runtime not ready' })
    }
    const svc = host.diagnostics
    reply.send({ requestId: randomUUID(), summary: svc.summary(), entries: svc.all() })
  })

  app.get('/v1/startup', async (_req, reply) => {
    if (host.state !== 'READY' && host.state !== 'DEGRADED') {
      return reply.status(503).send({ code: 'NOT_READY', message: 'Runtime not ready' })
    }
    const p = host.profile()
    reply.send({
      requestId: randomUUID(),
      startupId: p.runtimeId,
      totalDurationMs: p.startupDurationMs,
      timeline: p.startupTimeline,
    })
  })

  app.get('/v1/profile', async (_req, reply) => {
    if (host.state !== 'READY' && host.state !== 'DEGRADED') {
      return reply.status(503).send({ code: 'NOT_READY', message: 'Runtime not ready' })
    }
    reply.send({ requestId: randomUUID(), ...host.profile() })
  })
}
