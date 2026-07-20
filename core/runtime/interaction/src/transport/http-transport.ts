import type { Transport, RuntimeInteractionRequest, RuntimeInteractionResponse } from '../types.js'

export interface HttpTransportClient {
  execute(request: { input: string; contentType: string; requestId: string }): Promise<{
    executionId: string
    output: string
    events: unknown[]
    metadata: Record<string, unknown>
    durationMs: number
  }>
}

export class HttpTransport implements Transport {
  readonly type = 'HTTP' as const

  constructor(private readonly client: HttpTransportClient) {}

  async send(request: RuntimeInteractionRequest): Promise<RuntimeInteractionResponse> {
    const result = await this.client.execute({
      input: request.input,
      contentType: 'TEXT',
      requestId: request.id,
    })
    return {
      executionId: result.executionId,
      output: result.output,
      events: result.events as RuntimeInteractionResponse['events'],
      metadata: result.metadata,
      durationMs: result.durationMs,
    }
  }

  close(): Promise<void> {
    return Promise.resolve()
  }
}
