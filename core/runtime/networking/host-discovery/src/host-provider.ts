import type { Provider, ProviderMetadata, ProviderHealth, ExecutionEnvironment, ProviderCapabilityType } from '@rohinik-org/kernel'
import type { HostResource } from '@rohinik-org/compiler'

const ENVIRONMENT_MAP: Partial<Record<string, ExecutionEnvironment>> = {
  binary: 'SHELL',
  runtime: 'SHELL',
  shell: 'SHELL',
  container: 'SHELL',
  database: 'FILESYSTEM',
  gpu: 'GPU',
  browser: 'BROWSER',
}

const CAPABILITY_MAP: Partial<Record<string, ProviderCapabilityType>> = {
  binary: 'SHELL_RUNTIME',
  runtime: 'SHELL_RUNTIME',
  shell: 'SHELL_RUNTIME',
  container: 'CONTAINER_RUNTIME',
}

export class HostProvider implements Provider {
  readonly metadata: ProviderMetadata

  constructor(private readonly resource: HostResource) {
    const env = (ENVIRONMENT_MAP[resource.resourceType] ?? 'SHELL') as ExecutionEnvironment
    const cap = (CAPABILITY_MAP[resource.resourceType] ?? 'SHELL_RUNTIME') as ProviderCapabilityType
    this.metadata = {
      providerId: resource.id,
      name: resource.displayName,
      environments: [env],
      capabilities: [cap],
      version: resource.version ?? 'unknown',
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.resource.healthStatus === 'AVAILABLE'
  }

  async health(): Promise<ProviderHealth> {
    return {
      status: this.resource.healthStatus === 'AVAILABLE' ? 'HEALTHY' : 'UNAVAILABLE',
      ...(this.resource.healthMessage !== undefined ? { message: this.resource.healthMessage } : {}),
    }
  }
}
