import { describe, it, expect, vi } from 'vitest'
import { McpAdapter } from '../mcp-adapter.js'
import type { McpClient } from '../mcp-binding.js'

function mockClient(tools: Array<{ name: string; description?: string }>): McpClient {
  return {
    callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'result' }] }),
    listTools: vi.fn().mockResolvedValue({ tools }),
  }
}

describe('McpAdapter', () => {
  it('discover: maps MCP tools to RawDiscoveryModel', async () => {
    const client = mockClient([
      { name: 'read_file', description: 'Reads a file from the filesystem' },
      { name: 'write_file', description: 'Writes content to a file' },
    ])
    const adapter = new McpAdapter((_endpoint) => client)
    const raw = await adapter.discover({ endpoint: 'http://localhost:3000' })
    expect(raw.protocol).toBe('mcp')
    expect(raw.items).toHaveLength(2)
    expect((raw.items[0] as { name: string }).name).toBe('read_file')
  })

  it('validate: accepts valid RawDiscoveryModel', () => {
    const adapter = new McpAdapter((_e) => mockClient([]))
    const result = adapter.validate({ protocol: 'mcp', items: [{ name: 'test_tool' }], metadata: {} })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('validate: rejects wrong protocol', () => {
    const adapter = new McpAdapter((_e) => mockClient([]))
    const result = adapter.validate({ protocol: 'openapi', items: [], metadata: {} })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain("Expected protocol 'mcp'")
  })

  it('buildBindings: produces one ExecutionBinding per tool', () => {
    const client = mockClient([{ name: 'read_file' }, { name: 'write_file' }])
    const adapter = new McpAdapter((_e) => client)
    const raw = { protocol: 'mcp', items: [{ name: 'read_file' }, { name: 'write_file' }], metadata: {} }
    const bindings = adapter.buildBindings(raw, { endpoint: 'http://localhost:3000' })
    expect(bindings.size).toBe(2)
    expect(bindings.has('read_file')).toBe(true)
  })

  it('ExecutionBinding.invoke: delegates to client.callTool', async () => {
    const client = mockClient([{ name: 'read_file' }])
    const adapter = new McpAdapter((_e) => client)
    const raw = { protocol: 'mcp', items: [{ name: 'read_file' }], metadata: {} }
    const bindings = adapter.buildBindings(raw, { endpoint: 'http://localhost:3000' })
    await bindings.get('read_file')!.invoke({ path: '/tmp/test.txt' })
    expect(vi.mocked(client.callTool)).toHaveBeenCalledWith({
      name: 'read_file',
      arguments: { path: '/tmp/test.txt' },
    })
  })

  it('infers filesystem tags for file-related tools', async () => {
    const client = mockClient([{ name: 'read_file', description: 'Read' }])
    const adapter = new McpAdapter((_e) => client)
    const raw = await adapter.discover({ endpoint: 'http://localhost:3000' })
    const tags = (raw.items[0] as { tags: string[] }).tags
    expect(tags).toContain('filesystem')
  })
})
