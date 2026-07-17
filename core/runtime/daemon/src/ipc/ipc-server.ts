import { createServer, Server, Socket } from 'node:net'
import { createInterface } from 'node:readline'
import type { RuntimeCommand, RuntimeResponse } from '@rohinik-org/compiler'
import { ProtocolCodec } from './protocol-codec.js'

export type IpcRequestHandler = (command: RuntimeCommand) => Promise<RuntimeResponse>

export class IpcServer {
  private server: Server | undefined
  private readonly codec = new ProtocolCodec()

  async listen(socketPath: string, handler: IpcRequestHandler): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server = createServer((socket: Socket) => {
        const rl = createInterface({ input: socket, crlfDelay: Infinity })
        rl.on('line', (line) => {
          if (!line.trim()) return
          void (async () => {
            let response: RuntimeResponse
            try {
              const msg = this.codec.decode(line)
              const cmd = msg as RuntimeCommand
              response = await handler(cmd)
            } catch (err) {
              const parsed = (() => { try { return this.codec.decode(line) as RuntimeCommand } catch { return undefined } })()
              response = {
                requestId: parsed?.requestId ?? 'unknown',
                success: false,
                payload: null,
                error: err instanceof Error ? err.message : String(err),
              }
            }
            socket.write(this.codec.encode(response))
          })()
        })
        socket.on('error', () => { /* client disconnect */ })
      })

      this.server.on('error', reject)
      this.server.listen(socketPath, () => resolve())
    })
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (!this.server) { resolve(); return }
      this.server.close((err) => { if (err) reject(err); else resolve() })
    })
  }
}
