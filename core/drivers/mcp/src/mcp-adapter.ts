import type { CapabilityAdapter, AdapterConfig, RawDiscoveryModel, AdapterValidationResult } from '@rohinik-org/adapter-sdk'
import { McpExecutionBinding, type McpClient, type McpTool } from './mcp-binding.js'

export class McpAdapter implements CapabilityAdapter {
  readonly id = '@rohinik-org/mcp'
  readonly protocol = 'mcp'
  readonly version = '1.0.0'

  constructor(private readonly clientFactory: (endpoint: string) => McpClient) {}

  async discover(config: AdapterConfig): Promise<RawDiscoveryModel> {
    const endpoint = config.endpoint ?? ''
    if (!endpoint) throw new Error('McpAdapter requires config.endpoint')

    const client = this.clientFactory(endpoint)
    const result = await client.listTools()
    const tools = result.tools ?? []

    return {
      protocol: 'mcp',
      items: tools.map(t => ({
        name: t.name,
        description: t.description ?? '',
        inputSchema: t.inputSchema,
        tags: this.inferTags(t),
      })),
      metadata: {
        endpoint,
        toolCount: tools.length,
        protocolVersion: '2024-11-05',
      },
    }
  }

  validate(raw: RawDiscoveryModel): AdapterValidationResult {
    if (raw.protocol !== 'mcp') {
      return { valid: false, errors: [`Expected protocol 'mcp', got '${raw.protocol}'`], warnings: [] }
    }
    if (!Array.isArray(raw.items)) {
      return { valid: false, errors: ['items must be an array'], warnings: [] }
    }
    const unnamed = raw.items.filter(item => !(item as { name?: string }).name)
    const warnings = unnamed.length > 0
      ? [`${unnamed.length} tool(s) missing names`]
      : []
    return { valid: true, errors: [], warnings }
  }

  buildBindings(raw: RawDiscoveryModel, config: AdapterConfig): Map<string, McpExecutionBinding> {
    const endpoint = config.endpoint ?? ''
    const client = this.clientFactory(endpoint)
    const bindings = new Map<string, McpExecutionBinding>()
    for (const item of raw.items) {
      const tool = item as { name?: string }
      const toolName = tool.name ?? 'unknown'
      bindings.set(toolName, new McpExecutionBinding('@rohinik-org/mcp', toolName, toolName, client))
    }
    return bindings
  }

  private inferTags(tool: McpTool): string[] {
    const tags: string[] = []
    const name = tool.name.toLowerCase()
    if (name.includes('file') || name.includes('dir') || name.includes('path') || name.includes('read') || name.includes('write')) tags.push('filesystem')
    if (name.includes('fetch') || name.includes('http') || name.includes('url') || name.includes('web')) tags.push('web')
    if (name.includes('add') || name.includes('subtract') || name.includes('multiply') || name.includes('divide') || name.includes('calc')) tags.push('math')
    if (name.includes('llm') || name.includes('chat') || name.includes('complete') || name.includes('generate')) tags.push('llm')
    return tags
  }
}
