import type { KernelRuntime } from '@rohinik-org/kernel'

interface ShutdownStage {
  readonly name: string
  execute(runtime: KernelRuntime): Promise<void>
}

class ServiceStopStage implements ShutdownStage {
  readonly name = 'ServiceStopStage'
  async execute(_runtime: KernelRuntime): Promise<void> {
    // ponytail: no-op for Beta — corpus flush hook for Stage 8F
  }
}

class ExtensionUnloadStage implements ShutdownStage {
  readonly name = 'ExtensionUnloadStage'
  async execute(_runtime: KernelRuntime): Promise<void> {
    // ponytail: reserved — call descriptor.deactivate() in Stage 8F
  }
}

class ProviderDisconnectStage implements ShutdownStage {
  readonly name = 'ProviderDisconnectStage'
  async execute(_runtime: KernelRuntime): Promise<void> {
    // ponytail: reserved — drain provider connections in Stage 8F
  }
}

class RuntimeStopStage implements ShutdownStage {
  readonly name = 'RuntimeStopStage'
  async execute(runtime: KernelRuntime): Promise<void> {
    await runtime.shutdown()
  }
}

export class ShutdownPipeline {
  private readonly stages: ShutdownStage[] = [
    new ServiceStopStage(),
    new ExtensionUnloadStage(),
    new ProviderDisconnectStage(),
    new RuntimeStopStage(),
  ]

  constructor(private readonly runtime: KernelRuntime) {}

  async execute(): Promise<void> {
    const errors: Error[] = []
    for (const stage of this.stages) {
      try {
        await stage.execute(this.runtime)
      } catch (e) {
        errors.push(e instanceof Error ? e : new Error(String(e)))
      }
    }
    if (errors.length > 0) throw errors[0]
  }
}
