import { createInterface } from 'node:readline'
import type { InteractionAdapter, RuntimeInteractionRequest } from '@rohinik-org/interaction'
import { randomUUID } from 'node:crypto'

export class PowerShellAdapter implements InteractionAdapter {
  readonly id = 'powershell'
  private readonly rl = createInterface({ input: process.stdin, terminal: false })
  private readonly queue: Array<{ resolve: (v: RuntimeInteractionRequest) => void }> = []
  private readonly pending: string[] = []

  connect(): Promise<void> {
    this.rl.on('line', (line) => {
      const input = line.trim()
      if (!input) return
      const waiter = this.queue.shift()
      if (waiter) {
        waiter.resolve(this._make(input))
      } else {
        this.pending.push(input)
      }
    })
    return Promise.resolve()
  }

  disconnect(): Promise<void> {
    this.rl.close()
    return Promise.resolve()
  }

  nextRequest(): Promise<RuntimeInteractionRequest> {
    if (this.pending.length > 0) {
      return Promise.resolve(this._make(this.pending.shift()!))
    }
    return new Promise((resolve) => this.rl.once('line', (line) => resolve(this._make(line.trim()))))
  }

  private _make(input: string): RuntimeInteractionRequest {
    const sessionId = randomUUID()
    return {
      id: randomUUID(), sessionId, workspaceId: 'default',
      input, type: 'command' as const,
      context: {
        sessionId, workspaceId: 'default', adapterId: this.id,
        transport: 'IPC' as const, interactive: true,
        cwd: process.cwd(), locale: 'en-US',
        identity: { runtimeId: 'local', version: '0.1.0-beta' },
        requestNumber: 1, timestamp: new Date(),
      },
    }
  }
}
