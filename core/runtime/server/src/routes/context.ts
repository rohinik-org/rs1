import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { RuntimeHost } from '@rohinik-org/runtime'
import { DEFAULT_CONTEXT_POLICY } from '@rohinik-org/working-context'

export function registerContextRoutes(app: FastifyInstance, host: RuntimeHost): void {
  function ready(): boolean {
    return host.state === 'READY' || host.state === 'DEGRADED'
  }

  app.post('/v1/context/build', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const body = req.body as { intent?: { rawInput?: string; concepts?: string[]; preferredSkills?: string[] }; policy?: unknown }
    const raw = body.intent?.rawInput ?? ''
    const intent = {
      intentId: randomUUID(),
      schemaVersion: '1.0' as const,
      rawInput: raw,
      concepts: body.intent?.concepts ?? raw.split(/\s+/).filter(Boolean),
      preferredSkills: body.intent?.preferredSkills ?? [],
      constraints: { maxSteps: 10, requireVerification: false },
      translatedBy: 'http',
      translationConfidence: 1,
      unresolvedTerms: [],
    }
    const ctx = await host.contextManager.build(intent, (body.policy as never) ?? DEFAULT_CONTEXT_POLICY)
    reply.send(ctx)
  })

  app.get('/v1/context/policy', async (_req, reply) => {
    reply.send(DEFAULT_CONTEXT_POLICY)
  })
}
