import type { DaemonHost } from '../host/daemon-host.js'

export class ShutdownCoordinator {
  private shutdownPromise: Promise<void> | undefined

  constructor(
    private readonly host: DaemonHost,
    private readonly gracefulTimeoutMs: number = 10_000,
  ) {}

  async shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise
    this.shutdownPromise = this._doShutdown()
    return this.shutdownPromise
  }

  private async _doShutdown(): Promise<void> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Graceful shutdown timed out after ${this.gracefulTimeoutMs}ms`)), this.gracefulTimeoutMs)
    )
    await Promise.race([this.host.stop(), timeout])
  }

  wire(): void {
    const handler = () => { void this.shutdown() }
    process.on('SIGTERM', handler)
    process.on('SIGINT', handler)
  }
}
