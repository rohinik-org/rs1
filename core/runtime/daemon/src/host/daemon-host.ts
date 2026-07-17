import { randomUUID } from 'node:crypto'
import type { RuntimeCommand, RuntimeResponse, RuntimeHealth, DaemonPolicy } from '@rohinik-org/compiler'
import { DEFAULT_DAEMON_POLICY } from '@rohinik-org/compiler'
import { IpcServer } from '../ipc/ipc-server.js'
import { LifecycleManager } from '../lifecycle/lifecycle-manager.js'
import { HealthMonitor } from '../health/health-monitor.js'
import { DaemonPersistence } from '../persistence/daemon-persistence.js'
import { RuntimeJournal } from '../journal/runtime-journal.js'
import { ServiceRegistry } from '../registry/service-registry.js'
import type { RuntimeService } from '../registry/runtime-service.js'

export interface DaemonHostOptions {
  policy?: DaemonPolicy
  runtimeDir?: string
  services?: readonly RuntimeService[]
}

export class DaemonHost {
  private readonly policy: DaemonPolicy
  private readonly ipcServer = new IpcServer()
  private readonly lifecycle: LifecycleManager
  private readonly health = new HealthMonitor()
  private readonly persistence: DaemonPersistence
  private readonly journal = new RuntimeJournal()
  private readonly registry = new ServiceRegistry()
  private sessionId: string | undefined

  constructor(opts: DaemonHostOptions = {}) {
    this.policy = opts.policy ?? DEFAULT_DAEMON_POLICY
    this.lifecycle = new LifecycleManager(this.policy)
    this.persistence = new DaemonPersistence(opts.runtimeDir ?? '.rohinik')
    for (const svc of opts.services ?? []) {
      this.registry.register(svc)
    }
  }

  async start(): Promise<{ sessionId: string; socketPath: string }> {
    this.sessionId = randomUUID()
    const socketPath = this.persistence.socketPath(this.sessionId)

    this.persistence.writePid(process.pid)
    this.persistence.writeSession({
      sessionId: this.sessionId,
      startedAt: new Date().toISOString(),
      version: '0.1.0',
      runtimeDirectory: this.persistence['runtimeDir'],
    })

    await this.lifecycle.startAll(this.registry.all())
    this.journal.append('RUNTIME_STARTED', { sessionId: this.sessionId })

    await this.ipcServer.listen(socketPath, cmd => this.dispatch(cmd))

    return { sessionId: this.sessionId, socketPath }
  }

  async dispatch(command: RuntimeCommand): Promise<RuntimeResponse> {
    this.journal.append('COMMAND_RECEIVED', { type: command.type, requestId: command.requestId })
    try {
      let payload: unknown
      if (command.type === 'STATUS') {
        payload = await this.health.collect(this.sessionId ?? '', this.registry.all())
      } else if (command.type === 'SHUTDOWN') {
        void this.stop()
        payload = { acknowledged: true }
      } else {
        payload = { dispatched: command.type }
      }
      this.journal.append('COMMAND_COMPLETED', { type: command.type, requestId: command.requestId })
      return { requestId: command.requestId, success: true, payload }
    } catch (err) {
      return {
        requestId: command.requestId,
        success: false,
        payload: null,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  async stop(): Promise<void> {
    await this.ipcServer.close()
    await this.lifecycle.stopAll(this.registry.all())
    this.journal.append('RUNTIME_STOPPED')
    this.persistence.removePid()
    this.persistence.removeSession()
  }

  async healthCheck(): Promise<RuntimeHealth> {
    return this.health.collect(this.sessionId ?? '', this.registry.all())
  }

  getJournal(): RuntimeJournal { return this.journal }
  getRegistry(): ServiceRegistry { return this.registry }
}
