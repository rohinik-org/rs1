import type { InteractionAdapter, RuntimeInteractionRequest, RuntimeInteractionResponse, Transport } from './types.js'
import type { InteractionHistory, InteractionHistoryEntry } from '@rohinik-org/runtime-state'

export interface InteractionLayerOptions {
  adapter: InteractionAdapter
  transport: Transport
  history: InteractionHistory
}

export class InteractionLayer {
  private readonly adapter: InteractionAdapter
  private readonly transport: Transport
  private readonly history: InteractionHistory

  constructor(opts: InteractionLayerOptions) {
    this.adapter = opts.adapter
    this.transport = opts.transport
    this.history = opts.history
  }

  async process(request: RuntimeInteractionRequest): Promise<RuntimeInteractionResponse> {
    const start = Date.now()
    let response: RuntimeInteractionResponse
    try {
      response = await this.transport.send(request)
    } catch (err) {
      const entry: InteractionHistoryEntry = {
        requestNumber: request.context.requestNumber,
        sessionId: request.sessionId,
        workspaceId: request.workspaceId,
        adapterId: this.adapter.id,
        input: request.input,
        output: String(err),
        durationMs: Date.now() - start,
        timestamp: new Date(),
      }
      this.history.append(entry)
      throw err
    }
    const entry: InteractionHistoryEntry = {
      requestNumber: request.context.requestNumber,
      sessionId: request.sessionId,
      workspaceId: request.workspaceId,
      adapterId: this.adapter.id,
      input: request.input,
      output: response.output,
      durationMs: response.durationMs,
      timestamp: new Date(),
    }
    this.history.append(entry)
    return response
  }
}
