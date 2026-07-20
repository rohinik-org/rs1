import type { ExecutionDriver, DriverBinding } from '@rohinik-org/capability-manifest'

const HEALTH_TIMEOUT_MS = 5000

export class DriverRegistry {
  private readonly bindings = new Map<string, DriverBinding>()

  register(binding: DriverBinding): void {
    const id = binding.descriptor.id
    if (this.bindings.has(id)) throw new Error(`Driver already registered: ${id}`)
    this.bindings.set(id, binding)
  }

  findById(id: string): DriverBinding | undefined {
    return this.bindings.get(id)
  }

  list(): ReadonlyArray<DriverBinding> {
    return Array.from(this.bindings.values())
  }

  async health(): Promise<ReadonlyArray<{ driverId: string; status: string; message?: string }>> {
    return Promise.all(
      Array.from(this.bindings.values()).map(async (b) => {
        const id = b.descriptor.id
        try {
          const h = await Promise.race([
            b.driver.health(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), HEALTH_TIMEOUT_MS)
            ),
          ])
          return { driverId: id, status: h.status, message: h.message }
        } catch {
          return { driverId: id, status: 'degraded', message: 'health check timed out' }
        }
      })
    )
  }

  async shutdown(): Promise<void> {
    const SHUTDOWN_TIMEOUT_MS = 30000
    await Promise.all(
      Array.from(this.bindings.values()).map(async (b) => {
        try {
          await Promise.race([
            b.driver.shutdown(),
            new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
          ])
        } catch {
          // force-continue shutdown
        }
      })
    )
  }
}
