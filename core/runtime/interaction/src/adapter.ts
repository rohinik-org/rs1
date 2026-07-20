import { randomUUID } from 'node:crypto'
import type { InteractionAdapter, RuntimeInteractionRequest } from './types.js'

export class NullAdapter implements InteractionAdapter {
  constructor(
    readonly id: string,
    private readonly fixedRequest: RuntimeInteractionRequest,
  ) {}

  connect(): Promise<void> { return Promise.resolve() }
  disconnect(): Promise<void> { return Promise.resolve() }
  nextRequest(): Promise<RuntimeInteractionRequest> { return Promise.resolve(this.fixedRequest) }
}

export function makeNullRequest(overrides: Partial<RuntimeInteractionRequest> = {}): RuntimeInteractionRequest {
  const sessionId = randomUUID()
  const workspaceId = randomUUID()
  return {
    id: randomUUID(),
    sessionId,
    workspaceId,
    input: 'test input',
    type: 'conversation',
    context: {
      sessionId,
      workspaceId,
      adapterId: 'null',
      transport: 'HTTP',
      interactive: false,
      cwd: '/tmp',
      locale: 'en-US',
      identity: { runtimeId: 'test', version: '0.0.0' },
      requestNumber: 1,
      timestamp: new Date(),
    },
    ...overrides,
  }
}
