import type { DaemonPolicy } from '@rohinik-org/compiler'
import type { RuntimeService } from '../registry/runtime-service.js'

// startup order: network → memory → planner → executor → reflection → autonomy
const STARTUP_ORDER = ['network', 'memory', 'planner', 'executor', 'reflection', 'autonomy'] as const

export class LifecycleManager {
  constructor(private readonly policy: DaemonPolicy) {}

  orderedStartup(services: readonly RuntimeService[]): readonly RuntimeService[] {
    const indexed = new Map(services.map(s => [s.serviceId, s]))
    const ordered: RuntimeService[] = []
    for (const id of STARTUP_ORDER) {
      const svc = indexed.get(id)
      if (svc) ordered.push(svc)
    }
    // any services not in the known order go last
    for (const svc of services) {
      if (!STARTUP_ORDER.includes(svc.serviceId as typeof STARTUP_ORDER[number])) {
        ordered.push(svc)
      }
    }
    return ordered
  }

  orderedShutdown(services: readonly RuntimeService[]): readonly RuntimeService[] {
    return [...this.orderedStartup(services)].reverse()
  }

  async startAll(services: readonly RuntimeService[]): Promise<void> {
    for (const svc of this.orderedStartup(services)) {
      await svc.start()
    }
  }

  async stopAll(services: readonly RuntimeService[]): Promise<void> {
    const errors: Error[] = []
    for (const svc of this.orderedShutdown(services)) {
      try {
        await svc.stop()
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)))
      }
    }
    if (errors.length > 0) throw errors[0]
  }

  isCritical(serviceId: string): boolean {
    return this.policy.criticalServices.includes(serviceId)
  }

  async restartService(svc: RuntimeService, attempt = 1): Promise<void> {
    if (attempt > this.policy.maxRestartAttempts) {
      throw new Error(`Service ${svc.serviceId} exceeded max restart attempts (${this.policy.maxRestartAttempts})`)
    }
    await svc.stop()
    await svc.start()
  }
}
