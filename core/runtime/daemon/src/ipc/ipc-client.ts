import { connect, Socket } from 'node:net'
import { createInterface } from 'node:readline'
import type { RuntimeCommand, RuntimeResponse } from '@rohinik-org/compiler'
import { ProtocolCodec } from './protocol-codec.js'

export class IpcClient {
  private socket: Socket | undefined
  private readonly codec = new ProtocolCodec()
  private readonly pending = new Map<string, { resolve: (r: RuntimeResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()

  constructor(private readonly socketPath: string, private readonly timeoutMs = 5_000) {}

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const sock = connect(this.socketPath, () => resolve())
      sock.on('error', reject)
      this.socket = sock

      const rl = createInterface({ input: sock, crlfDelay: Infinity })
      rl.on('line', (line) => {
        if (!line.trim()) return
        try {
          const msg = this.codec.decode(line) as RuntimeResponse
          const pending = this.pending.get(msg.requestId)
          if (pending) {
            clearTimeout(pending.timer)
            this.pending.delete(msg.requestId)
            pending.resolve(msg)
          }
        } catch { /* malformed response */ }
      })
    })
  }

  async send(command: RuntimeCommand): Promise<RuntimeResponse> {
    if (!this.socket) throw new Error('IpcClient not connected')
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(command.requestId)
        reject(new Error(`IPC request ${command.requestId} timed out after ${this.timeoutMs}ms`))
      }, this.timeoutMs)

      this.pending.set(command.requestId, { resolve, reject, timer })
      this.socket!.write(this.codec.encode(command))
    })
  }

  disconnect(): void {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer)
      reject(new Error('IpcClient disconnected'))
    }
    this.pending.clear()
    this.socket?.destroy()
    this.socket = undefined
  }
}
