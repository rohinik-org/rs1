import type { ExecutionBinding } from '@rohinik-org/adapter-sdk'

export interface McpClient {
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>
  listTools(): Promise<{ tools: McpTool[] }>
}

export interface McpTool {
  name: string
  description?: string
  inputSchema?: { type?: string; properties?: Record<string, unknown>; required?: string[] }
}

export class McpExecutionBinding implements ExecutionBinding {
  constructor(
    readonly adapterId: string,
    readonly capabilityId: string,
    private readonly toolName: string,
    private readonly client: McpClient,
  ) {}

  async invoke(input: unknown): Promise<unknown> {
    const args = (input !== null && typeof input === 'object') ? input as Record<string, unknown> : {}
    return this.client.callTool({ name: this.toolName, arguments: args })
  }
}
