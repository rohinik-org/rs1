import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  InMemoryCapabilityCatalog,
  DefaultExecutionResolver,
  RuntimeBuilder,
  AiosRouter,
  ManifestLoader,
  ManifestParser,
  ManifestValidator,
  CapabilityDependencyGraph,
  DEFAULT_SYSTEM_CONFIG,
  createRuntimeServices,
  MemoryTier,
  DeterministicTier,
  LocalToolTier,
  ExternalTier,
  ReasoningTier,
  ExecutionContextFactory,
  SingleStepPlanner,
  ExecutionEngine,
  type KernelRuntime,
} from '@rohinik-org/kernel'
import type { BootstrapPlan } from './bootstrap-plan.js'
import type {
  BootstrapContext,
  BootstrapResult,
  BootstrapMetadata,
  StageTimingEntry,
} from './bootstrap-context.js'
import {
  InMemoryProviderCatalog,
  DefaultDiagnosticsCollector,
} from './bootstrap-context.js'
import { IdentityService } from '../identity/identity-service.js'

// ponytail: ctx is typed 'any' internally — pipeline is the only consumer
type Ctx = BootstrapContext & Record<string, unknown>

interface BootstrapStage {
  readonly name: string
  execute(ctx: Ctx): Promise<void>
}

class KernelStage implements BootstrapStage {
  readonly name = 'KernelStage'

  async execute(ctx: Ctx): Promise<void> {
    const systemConfig = DEFAULT_SYSTEM_CONFIG
    const catalog = new InMemoryCapabilityCatalog()
    const resolver = new DefaultExecutionResolver(systemConfig)
    const kernelRuntime = new RuntimeBuilder(catalog, resolver, ctx.services).build()

    const factory = new ExecutionContextFactory(systemConfig, ctx.services)
    const planner = new SingleStepPlanner()
    const engine = new ExecutionEngine(catalog)
    const tiers = [
      new MemoryTier(catalog, resolver),
      new DeterministicTier(catalog, resolver),
      new LocalToolTier(catalog, resolver),
      new ExternalTier(catalog, resolver),
      new ReasoningTier(catalog, resolver),
    ]
    const router = new AiosRouter(tiers, factory, planner, engine)

    ctx['_runtime'] = kernelRuntime
    ctx['_router'] = router
    ctx.services.events.emit('runtime.kernel.ready', {
      startupId: ctx.startupId, stageName: this.name, durationMs: 0,
    })
  }
}

class ProviderStage implements BootstrapStage {
  readonly name = 'ProviderStage'

  private static readonly DRIVER_PATHS: Record<string, string[]> = {
    anthropic: ['core/drivers/anthropic/dist/index.js'],
    openai: ['core/drivers/openai/dist/index.js'],
    mock: ['core/drivers/mock-provider/dist/index.js'],
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async loadDriver(pkg: string, paths: string[]): Promise<any> {
    try {
      const req = createRequire(process.cwd() + '/package.json')
      return await import(req.resolve(pkg))
    } catch { /* fall through */ }
    for (const rel of paths) {
      const candidate = resolve(process.cwd(), rel)
      if (existsSync(candidate)) return import(pathToFileURL(candidate).href)
    }
    return null
  }

  async execute(ctx: Ctx): Promise<void> {
    const runtime = ctx['_runtime'] as KernelRuntime
    const { providers } = ctx.config

    for (const [name, cfg] of Object.entries(providers)) {
      if (!cfg.apiKey) continue
      try {
        const paths = ProviderStage.DRIVER_PATHS[name] ?? []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod: any = await this.loadDriver(`@rohinik-org/${name}`, paths)
        if (!mod) {
          ctx.diagnostics.warn('PROVIDER_DRIVER_NOT_FOUND', `Driver for '${name}' not found — provider skipped`)
          ctx.providers.register({ id: name, name, status: 'UNAVAILABLE' })
          continue
        }
        if (name === 'anthropic' && mod.AnthropicProvider) {
          const provider = new mod.AnthropicProvider({
            apiKey: cfg.apiKey,
            ...(cfg.baseUrl && { baseUrl: cfg.baseUrl }),
          })
          runtime.registerProvider(provider)
          ctx.providers.register({ id: 'anthropic', name: provider.metadata?.name ?? 'Anthropic', status: 'HEALTHY' })
        } else if (name === 'openai' && mod.OpenAIProvider) {
          const provider = new mod.OpenAIProvider({
            apiKey: cfg.apiKey,
            ...(cfg.baseUrl && { baseUrl: cfg.baseUrl }),
          })
          runtime.registerProvider(provider)
          ctx.providers.register({ id: 'openai', name: provider.metadata?.name ?? 'OpenAI', status: 'HEALTHY' })
        } else if (name === 'mock' && mod.MockReasoningProvider) {
          const provider = new mod.MockReasoningProvider()
          runtime.registerProvider(provider)
          ctx.providers.register({ id: 'mock', name: provider.metadata?.name ?? 'Mock', status: 'HEALTHY' })
        }
      } catch (e) {
        ctx.diagnostics.warn('PROVIDER_LOAD_ERROR', `Failed to load provider '${name}': ${String(e)}`)
        ctx.providers.register({ id: name, name, status: 'UNAVAILABLE' })
      }
    }

    ctx.services.events.emit('runtime.providers.ready', {
      startupId: ctx.startupId, stageName: this.name, providersLoaded: ctx.providers.list().length,
    })
  }
}

class BuiltinStage implements BootstrapStage {
  readonly name = 'BuiltinStage'

  async execute(ctx: Ctx): Promise<void> {
    ctx.plan.builtins.validate()
    const runtime = ctx['_runtime'] as KernelRuntime
    let loaded = 0
    for (const descriptor of ctx.plan.builtins.getAll()) {
      await descriptor.activate(runtime)
      loaded++
    }
    ctx['_builtinsLoaded'] = loaded
    ctx.services.events.emit('runtime.builtins.ready', {
      startupId: ctx.startupId, stageName: this.name, builtinsLoaded: loaded,
    })
  }
}

class ExtensionStage implements BootstrapStage {
  readonly name = 'ExtensionStage'

  async execute(ctx: Ctx): Promise<void> {
    const runtime = ctx['_runtime'] as KernelRuntime
    const { extensions } = ctx.plan
    let loaded = 0
    try {
      const loader = new ManifestLoader(
        new ManifestParser(),
        new ManifestValidator(DEFAULT_SYSTEM_CONFIG.runtime.manifest, '0.1.0'),
        new CapabilityDependencyGraph(),
      )
      const plan = await loader.load(extensions.paths as string[])
      for (const w of plan.warnings) ctx.diagnostics.warn('EXTENSION_LOAD_WARNING', w)
      if (plan.manifests.length > 0) {
        await runtime.activate(plan)
        loaded = plan.manifests.length
      } else {
        await runtime.activate({ manifests: [], errors: [], warnings: [] })
      }
    } catch (e) {
      if (extensions.failureMode === 'fatal') throw e
      ctx.diagnostics.warn('EXTENSION_LOAD_FAILED', `Extension load failed (non-fatal): ${String(e)}`)
      await runtime.activate({ manifests: [], errors: [], warnings: [] })
    }
    ctx['_extensionsLoaded'] = loaded
    ctx.services.events.emit('runtime.extensions.ready', {
      startupId: ctx.startupId, stageName: this.name, extensionsLoaded: loaded,
    })
  }
}

class ServiceStage implements BootstrapStage {
  readonly name = 'ServiceStage'

  async execute(ctx: Ctx): Promise<void> {
    const started: string[] = []
    if (ctx.plan.services.corpus) {
      // ponytail: dynamic import keeps corpus out of kernel bundle; try/catch makes it non-fatal
      try {
        const { CorpusService, JsonCorpusStorage } = await import('@rohinik-org/corpus')
        // CorpusService(bus, storage, runtimeId, runtimeVersion)
        const storage = new JsonCorpusStorage(
          resolve(process.cwd(), '.rohinik', 'corpus'),
        )
        const corpus = new CorpusService(
          ctx.services.events,
          storage,
          ctx.config.runtimeId,
          '0.1.0',
        )
        corpus.start()
        started.push('corpus')
      } catch (e) {
        ctx.diagnostics.warn('CORPUS_START_FAILED', `CorpusService failed to start: ${String(e)}`)
      }
    }
    ctx['_servicesStarted'] = started
    ctx.services.events.emit('runtime.services.ready', {
      startupId: ctx.startupId, stageName: this.name, servicesStarted: started,
    })
  }
}

class ReadyStage implements BootstrapStage {
  readonly name = 'ReadyStage'

  async execute(ctx: Ctx): Promise<void> {
    ctx.services.events.emit('runtime.ready', {
      startupId: ctx.startupId, stageName: this.name,
    })
  }
}

class IdentityStage implements BootstrapStage {
  readonly name = 'IdentityStage'

  async execute(ctx: Ctx): Promise<void> {
    const runtime = ctx['_runtime'] as KernelRuntime
    const identity = new IdentityService(
      ctx.config.persona,
      () => runtime.listCapabilities().map(s => s.skillId),
      () => ctx.providers.list().filter(p => p.status === 'HEALTHY').map(p => p.id),
    )
    ctx['_identity'] = identity
    ctx.services.events.emit('runtime.identity.ready', { startupId: ctx.startupId, stageName: this.name })
  }
}

export class BootstrapPipeline {
  private readonly startupId = randomUUID()
  private readonly stages: BootstrapStage[] = [
    new KernelStage(),
    new ProviderStage(),
    new BuiltinStage(),
    new IdentityStage(),
    new ExtensionStage(),
    new ServiceStage(),
    new ReadyStage(),
  ]

  constructor(private readonly plan: BootstrapPlan) {}

  async execute(): Promise<BootstrapResult> {
    const providers = new InMemoryProviderCatalog()
    const diagnostics = new DefaultDiagnosticsCollector()
    const systemConfig = DEFAULT_SYSTEM_CONFIG
    const services = createRuntimeServices(systemConfig)
    const bootstrapStart = Date.now()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx: any = {
      config: this.plan.config,
      plan: this.plan,
      services,
      providers,
      diagnostics,
      startupId: this.startupId,
    }

    services.events.emit('runtime.bootstrap.started', {
      startupId: this.startupId,
      timestamp: bootstrapStart,
    })

    const timeline: StageTimingEntry[] = []

    for (const stage of this.stages) {
      const stageStart = Date.now()
      await stage.execute(ctx as Ctx)
      const stageEnd = Date.now()
      timeline.push({
        stageName: stage.name,
        timestampStart: stageStart,
        timestampEnd: stageEnd,
        durationMs: stageEnd - stageStart,
        status: 'ok',
      })
    }

    const totalDuration = Date.now() - bootstrapStart
    const providerList = providers.list()

    const metadata: BootstrapMetadata = {
      startupId: this.startupId,
      durationMs: totalDuration,
      startupTimeline: timeline,
      diagnostics: diagnostics.all(),
      warnings: diagnostics.all().filter(d => d.severity === 'WARN').map(d => d.message),
      servicesStarted: (ctx._servicesStarted as string[]) ?? [],
      extensionsLoaded: (ctx._extensionsLoaded as number) ?? 0,
      providersLoaded: providerList.filter(p => p.status === 'HEALTHY').length,
      capabilitiesLoaded: 0,
      builtinsLoaded: (ctx._builtinsLoaded as number) ?? 0,
      providers: providerList,
    }

    services.events.emit('runtime.bootstrap.completed', {
      startupId: this.startupId,
      totalDurationMs: totalDuration,
      providersLoaded: metadata.providersLoaded,
      extensionsLoaded: metadata.extensionsLoaded,
    })

    return {
      metadata,
      runtime: ctx._runtime as KernelRuntime,
      router: ctx._router,
      identity: ctx._identity as IdentityService,
    }
  }
}
