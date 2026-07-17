import type { RuntimeHealth, ServiceStatus } from '@rohinik-org/compiler'
import type { RuntimeService } from '../registry/runtime-service.js'

export class HealthMonitor {
  private activeExecutions = 0

  incrementActive(): void { this.activeExecutions++ }
  decrementActive(): void { if (this.activeExecutions > 0) this.activeExecutions-- }

  async collect(sessionId: string, services: readonly RuntimeService[]): Promise<RuntimeHealth> {
    const mem = process.memoryUsage()
    const statuses: ServiceStatus[] = []
    for (const svc of services) {
      statuses.push(await svc.health())
    }
    return {
      sessionId,
      services: statuses,
      cpuPercent: 0, // ponytail: no cross-platform cpu% without native addons; add when needed
      memoryBytes: mem.heapUsed,
      activeExecutions: this.activeExecutions,
    }
  }
}
