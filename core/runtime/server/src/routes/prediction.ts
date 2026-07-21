import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { RuntimeHost } from '@rohinik-org/runtime'
import { DEFAULT_PREDICTION_POLICY } from '@rohinik-org/prediction-ir'

export function registerPredictionRoutes(app: FastifyInstance, host: RuntimeHost): void {
  function ready(): boolean {
    return host.state === 'READY' || host.state === 'DEGRADED'
  }

  app.post('/v1/prediction/predict', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const body = req.body as { intent?: { rawInput?: string; concepts?: string[]; preferredSkills?: string[] }; policy?: unknown }
    const raw = body.intent?.rawInput ?? ''
    const workingContext = await host.contextManager.build({
      intentId: randomUUID(),
      schemaVersion: '1.0' as const,
      rawInput: raw,
      concepts: body.intent?.concepts ?? raw.split(/\s+/).filter(Boolean),
      preferredSkills: body.intent?.preferredSkills ?? [],
      constraints: { maxSteps: 10, requireVerification: false },
      translatedBy: 'http',
      translationConfidence: 1,
      unresolvedTerms: [],
    })
    const bundle = await host.predictionManager.predict(workingContext, (body.policy as never) ?? DEFAULT_PREDICTION_POLICY)
    reply.send(bundle)
  })

  app.get('/v1/prediction/policy', async (_req, reply) => {
    reply.send(DEFAULT_PREDICTION_POLICY)
  })
}
