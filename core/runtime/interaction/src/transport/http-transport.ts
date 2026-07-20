import type { Transport, RuntimeInteractionRequest, RuntimeInteractionResponse } from '../types.js'

// ponytail: custom interface rather than RohinikHttpClient so tests can mock without importing the full CLI client
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

  // ponytail: HttpTransport is stateless; close() exists to satisfy Transport interface
  close(): Promise<void> {
    return Promise.resolve()
  }
}
