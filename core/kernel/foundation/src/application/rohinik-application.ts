import type { ApplicationOptions, ApplicationContext, ApplicationManifest, ApplicationDiagnostics, ApplicationStatus } from '@rohinik-org/compiler'
import type { PlanningFacade, ExecutionFacade, MemoryFacade, ReasoningFacade, ReflectionFacade, ObservationFacade, ClusterFacade, CertifyFacade } from '../facades/facade-types.js'
import { DefaultPlanningFacade } from '../facades/planning-facade.js'
import { DefaultExecutionFacade } from '../facades/execution-facade.js'
import { DefaultMemoryFacade, NoopMemoryFacade } from '../facades/memory-facade.js'
import { DefaultReasoningFacade, NoopReasoningFacade } from '../facades/reasoning-facade.js'
import { DefaultReflectionFacade, NoopReflectionFacade } from '../facades/reflection-facade.js'
import { DefaultObservationFacade, NoopObservationFacade } from '../facades/observation-facade.js'
import { DefaultClusterFacade, NoopClusterFacade } from '../facades/cluster-facade.js'
import { DefaultCertifyFacade, NoopCertifyFacade } from '../facades/certify-facade.js'
import { ApplicationEventBus } from '../events/application-event-bus.js'
import { buildManifest } from '../manifest/application-manifest.js'
import { getDiagnostics, resolveEnabledFacades } from '../diagnostics/application-diagnostics.js'
import type { MemoryStore } from '@rohinik-org/memory'
import type { ReasoningStore } from '@rohinik-org/reasoning'
import type { ReflectionStore } from '@rohinik-org/reflection'
import type { ObservationStore } from '@rohinik-org/observer'
import type { CertificationStore } from '@rohinik-org/runtime-certification'

export type FullApplicationOptions = ApplicationOptions & {
  memoryStore?: MemoryStore
  reasoningStore?: ReasoningStore
  reflectionStore?: ReflectionStore
  observationStore?: ObservationStore
  certificationStore?: CertificationStore
}

export class RohinikApplication {
  private _status: ApplicationStatus = 'INITIALIZING'
  private readonly _appId: string
  private readonly _name: string
  private readonly _version: string
  private readonly _createdAt: string
  private readonly _opts: FullApplicationOptions

  readonly planning: PlanningFacade
  readonly execution: ExecutionFacade
  readonly memory: MemoryFacade
  readonly reasoning: ReasoningFacade
  readonly reflection: ReflectionFacade
  readonly observation: ObservationFacade
  readonly cluster: ClusterFacade
  readonly certify: CertifyFacade
  readonly events: ApplicationEventBus

  constructor(opts: FullApplicationOptions = {}) {
    this._opts = opts
    this._appId = opts.applicationId ?? crypto.randomUUID()
    this._name = opts.name ?? 'rohinik-app'
    this._version = opts.version ?? '0.1.0'
    this._createdAt = new Date().toISOString()

    this.events = new ApplicationEventBus(this._appId)
    this.planning = new DefaultPlanningFacade()
    this.execution = new DefaultExecutionFacade()
    this.memory = opts.enableMemory ? new DefaultMemoryFacade(opts.memoryStore) : new NoopMemoryFacade()
    this.reasoning = opts.enableReasoning ? new DefaultReasoningFacade(opts.reasoningStore) : new NoopReasoningFacade()
    this.reflection = opts.enableReflection ? new DefaultReflectionFacade(opts.reflectionStore) : new NoopReflectionFacade()
    this.observation = opts.enableObservation ? new DefaultObservationFacade(opts.observationStore) : new NoopObservationFacade()
    this.cluster = opts.enableCluster ? new DefaultClusterFacade() : new NoopClusterFacade()
    this.certify = opts.enableCertification ? new DefaultCertifyFacade(opts.certificationStore) : new NoopCertifyFacade()
  }

  static create(opts: FullApplicationOptions = {}): RohinikApplication {
    return new RohinikApplication(opts)
  }

  static builder(): ApplicationBuilder {
    return new ApplicationBuilder()
  }

  get context(): ApplicationContext {
    return {
      applicationId: this._appId,
      name: this._name,
      version: this._version,
      startedAt: this._createdAt,
      status: this._status,
    }
  }

  async start(): Promise<void> {
    this._status = 'READY'
    this.events.emit('application.started')
  }

  async stop(): Promise<void> {
    this._status = 'STOPPED'
    this.events.emit('application.stopped')
  }

  manifest(): ApplicationManifest {
    return buildManifest(this.context, this._opts)
  }

  diagnostics(): ApplicationDiagnostics {
    return getDiagnostics(this.context, resolveEnabledFacades(this._status, this._opts))
  }
}

export class ApplicationBuilder {
  private readonly _opts: FullApplicationOptions = {}

  withMemory(store?: MemoryStore): this {
    Object.assign(this._opts, { enableMemory: true, ...(store ? { memoryStore: store } : {}) })
    return this
  }

  withReasoning(store?: ReasoningStore): this {
    Object.assign(this._opts, { enableReasoning: true, ...(store ? { reasoningStore: store } : {}) })
    return this
  }

  withReflection(store?: ReflectionStore): this {
    Object.assign(this._opts, { enableReflection: true, ...(store ? { reflectionStore: store } : {}) })
    return this
  }

  withObservation(store?: ObservationStore): this {
    Object.assign(this._opts, { enableObservation: true, ...(store ? { observationStore: store } : {}) })
    return this
  }

  withCluster(): this {
    Object.assign(this._opts, { enableCluster: true })
    return this
  }

  withCertification(store?: CertificationStore): this {
    Object.assign(this._opts, { enableCertification: true, ...(store ? { certificationStore: store } : {}) })
    return this
  }

  build(): RohinikApplication {
    return new RohinikApplication(this._opts)
  }
}
