import Fastify from 'fastify'
import type { RuntimeHost } from '@rohinik-org/runtime'
import type { ServerConfig } from './types.js'
import { DecisionStore } from './decision-store.js'
import { registerRuntimeRoute } from './routes/runtime.js'
import { registerHealthRoute } from './routes/health.js'
import { registerExecuteRoute } from './routes/execute.js'
import { registerSimulateRoute } from './routes/simulate.js'
import { registerDecisionsRoute } from './routes/decisions.js'
import { registerIntrospectionRoutes } from './routes/introspection.js'
import { registerMemoryRoutes } from './routes/memory.js'
import { registerEventsRoute } from './routes/events.js'
import { registerShutdownRoute } from './routes/shutdown.js'
import { registerCapabilityRoutes } from './routes/capabilities.js'
import { registerKnowledgeRoutes } from './routes/knowledge.js'
import { registerAcquisitionRoutes } from './routes/acquisition.js'
import { registerContextRoutes } from './routes/context.js'
import { registerPredictionRoutes } from './routes/prediction.js'
import { registerPlannerRoutes } from './routes/planner.js'
import { registerExecutionRoutes } from './routes/execution.js'
import { registerEvaluationRoutes } from './routes/evaluation.js'
import { registerExperienceRoutes } from './routes/experience.js'
import { registerExperienceStoreRoutes } from './routes/experience-store.js'
import { registerExperienceQueryRoutes } from './routes/experience-query.js'
import { registerAgentRoutes } from './routes/agents.js'
import { registerAsyncExecutionRoutes, eventStore } from './routes/async-executions.js'
import { registerExecutionEventsRoute } from './routes/execution-events.js'

export class AiosServer {
  private readonly app = Fastify({ logger: false })
  private readonly store: DecisionStore

  constructor(
    private readonly host: RuntimeHost,
    private readonly config: ServerConfig,
  ) {
    this.store = new DecisionStore(host.config.runtime.routing.traceBuffer)
    registerRuntimeRoute(this.app, host, this.store)
    registerHealthRoute(this.app, host)
    registerExecuteRoute(this.app, host, this.store)
    registerSimulateRoute(this.app, host)
    registerDecisionsRoute(this.app, this.store)
    registerIntrospectionRoutes(this.app, host)
    registerMemoryRoutes(this.app)
    registerEventsRoute(this.app)
    registerShutdownRoute(this.app, host)
    registerCapabilityRoutes(this.app, host)
    registerKnowledgeRoutes(this.app, host)
    registerAcquisitionRoutes(this.app, host)
    registerContextRoutes(this.app, host)
    registerPredictionRoutes(this.app, host)
    registerPlannerRoutes(this.app, host)
    registerExecutionRoutes(this.app, host)
    registerEvaluationRoutes(this.app, host)
    registerExperienceRoutes(this.app, host)
    registerExperienceStoreRoutes(this.app, host)
    registerExperienceQueryRoutes(this.app, host)
    registerAgentRoutes(this.app, host)
    registerAsyncExecutionRoutes(this.app, host)
    registerExecutionEventsRoute(this.app, eventStore)
  }

  async listen(): Promise<void> {
    await this.app.listen({ port: this.config.port, host: this.config.host })
  }

  async close(): Promise<void> {
    await this.app.close()
  }
}
