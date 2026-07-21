import { EventEmitter } from 'node:events'
import { createServer as createNetServer } from 'node:net'
import type { Server as NetServer } from 'node:net'
import { platform } from 'node:os'
import { unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { KernelRuntime, AiosRouter } from '@rohinik-org/kernel'
import { DEFAULT_BUDGET } from '@rohinik-org/kernel'
import type { RuntimeHostState, RuntimeHostEvent } from '../types.js'
import type { BootstrapPlan } from './bootstrap-plan.js'
import type { BootstrapMetadata, ProviderEntry, HealthReport, RuntimeProfile } from './bootstrap-context.js'
import { BootstrapPipeline } from './bootstrap-pipeline.js'
import { ShutdownPipeline } from './shutdown-pipeline.js'
import type { IdentityService } from '../identity/identity-service.js'
import { DiagnosticsService } from '../diagnostics/diagnostics-service.js'
import { DriverRegistry } from '../kernel/driver-registry.js'
import { CapabilityDriverRegistry } from '../kernel/capability-driver-registry.js'
import { DriverBootstrap } from '../execution/driver-bootstrap.js'
import { BuiltinDriverProvider } from '../execution/builtin-driver-provider.js'
import { ExecutionDispatcher } from '../execution/execution-dispatcher.js'
import { CapabilityExecutor } from '../execution/capability-executor.js'
import { KnowledgeRegistry, SemanticIndex, KnowledgeService } from '@rohinik-org/knowledge'
import { EntityExtractionPipeline, ExtractorBootstrap, BuiltinExtractorProvider } from '@rohinik-org/entity-extractor'
import { SkillClassifier } from '@rohinik-org/skill-classifier'
import { CapabilitySourceRegistry, CapabilityAcquisitionPipeline, AcquisitionBootstrap } from '@rohinik-org/capability-acquisition'
import { CapabilityRegistry as InstalledCapabilityRegistry, InMemoryCapabilityLock } from '@rohinik-org/capability-registry'
import { BuiltinFilesystemSourceProvider } from '@rohinik-org/source-filesystem'
import { AcquisitionDriver } from '@rohinik-org/driver-acquisition'
import { ContextManager } from '@rohinik-org/context-manager'
import { PredictionManager } from '@rohinik-org/prediction-manager'
import { GoalResolver, PlanGenerator, PlanOptimizer, PlanEvaluator, PlanningEngine } from '@rohinik-org/planner'
import { ContextRanker } from '@rohinik-org/scoring'
import { ExecutionSupervisor, TaskScheduler, SkillInvoker, InMemoryExecutionSessionStore } from '@rohinik-org/execution'
import { InMemoryCapabilityCatalog } from '@rohinik-org/kernel'

function resolveSocketPath(): string {
  return platform() === 'win32'
    ? '\\\\.\\pipe\\rohinik-runtime'
    : '/tmp/rohinik.sock'
}

export class RuntimeHost {
  private _state: RuntimeHostState = 'CREATED'
  private _runtime: KernelRuntime | undefined
  private _router: AiosRouter | undefined
  private _metadata: BootstrapMetadata | undefined
  private _identity: IdentityService | undefined
  private _diagnosticsSvc: DiagnosticsService | undefined
  private _ipcServer: NetServer | undefined
  private _driverReg: DriverRegistry | undefined
  private _capabilityReg: CapabilityDriverRegistry | undefined
  private _executor: CapabilityExecutor | undefined
  private _knowledgeReg: KnowledgeRegistry | undefined
  private _semanticIdx: SemanticIndex | undefined
  private _knowledgeSvc: KnowledgeService | undefined
  private _sourceReg: CapabilitySourceRegistry | undefined
  private _installedCapReg: InstalledCapabilityRegistry | undefined
  private _acquisitionPipeline: CapabilityAcquisitionPipeline | undefined
  private _contextManager: ContextManager | undefined
  private _predictionManager: PredictionManager | undefined
  private _planner: PlanningEngine | undefined
  private _executionSupervisor: ExecutionSupervisor | undefined
  private readonly emitter = new EventEmitter()
  readonly socketPath: string

  constructor(private readonly plan: BootstrapPlan) {
    this.socketPath = plan.socketPath ?? resolveSocketPath()
  }

  get state(): RuntimeHostState {
    return this._state
  }

  get runtimeId(): string {
    return this.plan.config.runtimeId
  }

  get runtime(): KernelRuntime {
    if (!this._runtime) throw new Error('RuntimeHost not started')
    return this._runtime
  }

  get router(): AiosRouter {
    if (!this._router) throw new Error('RuntimeHost not started')
    return this._router
  }

  get config() {
    return this.plan.config
  }

  get identity(): IdentityService {
    if (!this._identity) throw new Error('RuntimeHost not started')
    return this._identity
  }

  get diagnostics(): DiagnosticsService {
    if (!this._diagnosticsSvc) throw new Error('RuntimeHost not started')
    return this._diagnosticsSvc
  }

  get executor(): CapabilityExecutor {
    if (!this._executor) throw new Error('RuntimeHost not started')
    return this._executor
  }

  get driverRegistry(): DriverRegistry {
    if (!this._driverReg) throw new Error('RuntimeHost not started')
    return this._driverReg
  }

  get knowledge(): KnowledgeService {
    if (!this._knowledgeSvc) throw new Error('RuntimeHost not started')
    return this._knowledgeSvc
  }

  get knowledgeRegistry(): KnowledgeRegistry {
    if (!this._knowledgeReg) throw new Error('RuntimeHost not started')
    return this._knowledgeReg
  }

  get semanticIndex(): SemanticIndex {
    if (!this._semanticIdx) throw new Error('RuntimeHost not started')
    return this._semanticIdx
  }

  get acquisition(): CapabilityAcquisitionPipeline {
    if (!this._acquisitionPipeline) throw new Error('RuntimeHost not started')
    return this._acquisitionPipeline
  }

  get installedCapabilities(): InstalledCapabilityRegistry {
    if (!this._installedCapReg) throw new Error('RuntimeHost not started')
    return this._installedCapReg
  }

  get sourceRegistry(): CapabilitySourceRegistry {
    if (!this._sourceReg) throw new Error('RuntimeHost not started')
    return this._sourceReg
  }

  get contextManager(): ContextManager {
    if (!this._contextManager) throw new Error('RuntimeHost not started')
    return this._contextManager
  }

  get predictionManager(): PredictionManager {
    if (!this._predictionManager) throw new Error('RuntimeHost not started')
    return this._predictionManager
  }

  get planner(): PlanningEngine {
    if (!this._planner) throw new Error('RuntimeHost not started')
    return this._planner
  }

  get executionSupervisor(): ExecutionSupervisor {
    if (!this._executionSupervisor) throw new Error('RuntimeHost not started')
    return this._executionSupervisor
  }

  on(event: RuntimeHostEvent, handler: () => void): void {
    this.emitter.on(event, handler)
  }

  listProviders(): ReadonlyArray<ProviderEntry> {
    return this._metadata?.providers ?? []
  }

  async health(): Promise<HealthReport> {
    const metadata = this._metadata
    const runtime = this._runtime

    const checks = [
      {
        subsystem: 'kernel',
        status: (runtime ? 'healthy' : 'unavailable') as 'healthy' | 'degraded' | 'unavailable',
      },
      {
        subsystem: 'eventbus',
        status: (runtime ? 'healthy' : 'unavailable') as 'healthy' | 'degraded' | 'unavailable',
      },
      {
        subsystem: 'providers',
        status: (() => {
          const providers = metadata?.providers ?? []
          const healthy = providers.filter(p => p.status === 'HEALTHY').length
          return (healthy > 0 ? 'healthy' : 'degraded') as 'healthy' | 'degraded' | 'unavailable'
        })(),
        data: {
          healthy: (metadata?.providers ?? []).filter(p => p.status === 'HEALTHY').length,
          total: (metadata?.providers ?? []).length,
        },
      },
      {
        subsystem: 'capabilities',
        status: (() => {
          const count = runtime?.listCapabilities().length ?? 0
          return (count > 0 ? 'healthy' : 'degraded') as 'healthy' | 'degraded' | 'unavailable'
        })(),
        data: { count: runtime?.listCapabilities().length ?? 0 },
      },
      {
        subsystem: 'corpus',
        status: (() => {
          const started = metadata?.servicesStarted ?? []
          return (started.includes('corpus') ? 'healthy' : 'degraded') as 'healthy' | 'degraded' | 'unavailable'
        })(),
      },
      {
        subsystem: 'extensions',
        status: (() => {
          const hasExtensionWarning = (metadata?.diagnostics ?? [])
            .some(d => d.code.startsWith('EXTENSION_'))
          return (hasExtensionWarning ? 'degraded' : 'healthy') as 'healthy' | 'degraded' | 'unavailable'
        })(),
        data: { loaded: metadata?.extensionsLoaded ?? 0 },
      },
      {
        subsystem: 'identity',
        status: (this._identity ? 'healthy' : 'unavailable') as 'healthy' | 'degraded' | 'unavailable',
      },
    ]

    const overallFailed = checks.some(c => c.status === 'unavailable')
    const overallDegraded = checks.some(c => c.status === 'degraded')
    const overallStatus = overallFailed ? 'unavailable' : overallDegraded ? 'degraded' : 'healthy'

    const report: HealthReport = {
      startupId: metadata?.startupId,
      status: overallStatus,
      checks,
      timestamp: Date.now(),
    }

    // ponytail: only structural failures (kernel/identity unavailable) trigger DEGRADED state transition
    const structuralFailure = checks
      .filter(c => c.subsystem === 'kernel' || c.subsystem === 'identity' || c.subsystem === 'eventbus')
      .some(c => c.status === 'unavailable')

    if (this._state === 'READY' && structuralFailure) {
      this._state = 'DEGRADED'
      this.emitter.emit('runtime:degraded')
    }

    return report
  }

  profile(): RuntimeProfile {
    if (!this._metadata || !this._runtime) throw new Error('RuntimeHost not started')
    const metadata = this._metadata
    return {
      runtimeId: this.runtimeId,
      version: '0.1.0-beta',
      uptimeMs: Math.round(process.uptime() * 1000),
      capabilities: this._runtime.listCapabilities(),
      providers: metadata.providers,
      servicesStarted: metadata.servicesStarted,
      extensionsLoaded: metadata.extensionsLoaded,
      builtinsLoaded: metadata.builtinsLoaded,
      startupDurationMs: metadata.durationMs,
      startupTimeline: metadata.startupTimeline,
      diagnosticSummary: {
        warnings: metadata.diagnostics.filter(d => d.severity === 'WARN').length,
        errors: metadata.diagnostics.filter(d => d.severity === 'ERROR').length,
      },
    }
  }

  async start(): Promise<void> {
    if (this._state !== 'CREATED' && this._state !== 'STOPPED') {
      throw new Error(`Cannot start: RuntimeHost is in state '${this._state}'`)
    }
    this._state = 'INITIALIZING'
    this._state = 'BOOTSTRAPPING'
    try {
      const result = await new BootstrapPipeline(this.plan).execute()
      this._runtime = result.runtime
      this._router = result.router
      this._metadata = result.metadata
      this._identity = result.identity
      this._diagnosticsSvc = new DiagnosticsService(result.metadata)

      this._driverReg = new DriverRegistry()
      this._capabilityReg = new CapabilityDriverRegistry()
      const driverBootstrap = new DriverBootstrap([new BuiltinDriverProvider()])
      await driverBootstrap.load(this._driverReg, this._capabilityReg)
      const dispatcher = new ExecutionDispatcher(this._driverReg, this._capabilityReg)
      this._executor = new CapabilityExecutor(dispatcher)

      this._knowledgeReg = new KnowledgeRegistry()
      this._semanticIdx = new SemanticIndex(this._knowledgeReg)
      const extractionPipeline = new EntityExtractionPipeline()
      await new ExtractorBootstrap([new BuiltinExtractorProvider()]).load(extractionPipeline)
      this._knowledgeSvc = new KnowledgeService(this._knowledgeReg, this._semanticIdx, extractionPipeline, new SkillClassifier())

      this._sourceReg = new CapabilitySourceRegistry()
      await new AcquisitionBootstrap([new BuiltinFilesystemSourceProvider([process.cwd()])]).load(this._sourceReg)
      this._installedCapReg = new InstalledCapabilityRegistry()
      this._acquisitionPipeline = new CapabilityAcquisitionPipeline(this._sourceReg, this._installedCapReg, new InMemoryCapabilityLock())
      const acquisitionDriver = new AcquisitionDriver(this._acquisitionPipeline, this._installedCapReg)
      this._driverReg!.register({ driver: acquisitionDriver, descriptor: acquisitionDriver.descriptor })

      this._contextManager = new ContextManager()
        .withKnowledge(this._knowledgeReg!)
        .withCapabilities(this._installedCapReg!)

      this._predictionManager = new PredictionManager()

      this._planner = new PlanningEngine(
        new GoalResolver(),
        new PlanGenerator(),
        new PlanOptimizer(),
        new PlanEvaluator(new ContextRanker()),
      )

      // ponytail: fresh catalog here — skills unavailable until capability installation wired in Stage 10E
      this._executionSupervisor = new ExecutionSupervisor(
        new SkillInvoker(new InMemoryCapabilityCatalog()),
        new TaskScheduler(),
        new InMemoryExecutionSessionStore(),
        this.emitter,
      )

      this._state = 'READY'
      await this._startIpc()
      this.emitter.emit('runtime:ready')
    } catch (err) {
      this._state = 'FAILED'
      throw err
    }
  }

  async stop(): Promise<void> {
    this._state = 'STOPPING'
    this.emitter.emit('runtime:stopping')
    await this._stopIpc()
    if (this._driverReg) await this._driverReg.shutdown()
    if (this._runtime) await new ShutdownPipeline(this._runtime).execute()
    this._driverReg = undefined
    this._capabilityReg = undefined
    this._executor = undefined
    this._knowledgeReg = undefined
    this._semanticIdx = undefined
    this._knowledgeSvc = undefined
    this._sourceReg = undefined
    this._installedCapReg = undefined
    this._acquisitionPipeline = undefined
    this._contextManager = undefined
    this._predictionManager = undefined
    this._planner = undefined
    this._executionSupervisor = undefined
    this._state = 'STOPPED'
    this.emitter.emit('runtime:stopped')
  }

  private async _startIpc(): Promise<void> {
    // clean up stale socket before binding (non-fatal on Windows named pipes)
    if (platform() !== 'win32') {
      await unlink(this.socketPath).catch(() => undefined)
    }

    const server = createNetServer((socket) => {
      let buf = ''
      socket.on('data', (chunk) => {
        buf += chunk.toString()
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const envelope = JSON.parse(line) as { protocol: number; type: string; payload: unknown }
            if (envelope.protocol !== 1) {
              socket.write(JSON.stringify({ protocol: 1, type: 'error', payload: { message: `Unsupported protocol: ${envelope.protocol}` } }) + '\n')
              return
            }
            if (envelope.type === 'ping') {
              socket.write(JSON.stringify({ protocol: 1, type: 'pong', payload: {} }) + '\n')
              return
            }
            if (envelope.type === 'request') {
              const req = envelope.payload as { input?: string; contentType?: string; intentHint?: string; requestId?: string }
              const requestId = req.requestId ?? randomUUID()
              const identityCtx = this._identity?.buildContext() ?? {}
              const routingRequest = {
                id: requestId,
                content: req.input ?? '',
                contentType: (req.contentType ?? 'TEXT') as 'TEXT',
                intentHint: req.intentHint,
                context: { __identity: identityCtx },
                metadata: {},
                constraints: { ...DEFAULT_BUDGET, allowReasoning: true },
                timestamp: new Date(),
              }
              Promise.resolve(this._router!.route(routingRequest)).then((result) => {
                const response = { executionId: requestId, output: JSON.stringify(result.output), events: [], metadata: {}, durationMs: result.executionTimeMs ?? 0 }
                socket.write(JSON.stringify({ protocol: 1, type: 'response', payload: response }) + '\n')
              }).catch((err: unknown) => {
                socket.write(JSON.stringify({ protocol: 1, type: 'error', payload: { message: String(err) } }) + '\n')
              })
            }
          } catch {
            socket.write(JSON.stringify({ protocol: 1, type: 'error', payload: { message: 'Invalid JSON' } }) + '\n')
          }
        }
      })
      socket.on('error', () => socket.destroy())
    })

    await new Promise<void>((resolve, reject) => {
      server.listen(this.socketPath, () => resolve())
      server.once('error', reject)
    })
    this._ipcServer = server
  }

  private async _stopIpc(): Promise<void> {
    const server = this._ipcServer
    if (!server) return
    await new Promise<void>((resolve) => server.close(() => resolve()))
    this._ipcServer = undefined
    if (platform() !== 'win32') {
      await unlink(this.socketPath).catch(() => undefined)
    }
  }
}
