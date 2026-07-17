import type { ServiceStatus } from '@rohinik-org/compiler'
import type { RuntimeService } from './runtime-service.js'

export class ServiceAdapter implements RuntimeService {
  private state: ServiceStatus['state'] = 'STOPPED'
  private startedAt: string | undefined
  private readonly startFn: () => Promise<void>
  private readonly stopFn: () => Promise<void>

  constructor(
    readonly serviceId: string,
    start: () => Promise<void>,
    stop: () => Promise<void>,
  ) {
    this.startFn = start
    this.stopFn = stop
  }

  async start(): Promise<void> {
    this.state = 'STARTING'
    await this.startFn()
    this.state = 'RUNNING'
    this.startedAt = new Date().toISOString()
  }

  async stop(): Promise<void> {
    this.state = 'STOPPING'
    await this.stopFn()
    this.state = 'STOPPED'
  }

  async health(): Promise<ServiceStatus> {
    const uptimeMs = this.startedAt ? Date.now() - new Date(this.startedAt).getTime() : 0
    return {
      serviceId: this.serviceId,
      state: this.state,
      ...(this.startedAt !== undefined && { startedAt: this.startedAt }),
      uptimeMs,
    }
  }
}

export class ServiceRegistry {
  private readonly services = new Map<string, RuntimeService>()

  register(service: RuntimeService): void {
    this.services.set(service.serviceId, service)
  }

  get(serviceId: string): RuntimeService | undefined {
    return this.services.get(serviceId)
  }

  all(): readonly RuntimeService[] {
    return [...this.services.values()]
  }
}
