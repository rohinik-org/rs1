import { describe, it, expect } from 'vitest'
import type {
  AdapterConfig,
  RawDiscoveryModel,
  AdapterValidationResult,
  ExecutionBinding,
  InstallSource,
  CapabilityAdapter,
} from '../index.js'

describe('adapter-ir types', () => {
  it('AdapterConfig accepts endpoint', () => {
    const cfg: AdapterConfig = { endpoint: 'http://localhost:3000' }
    expect(cfg.endpoint).toBe('http://localhost:3000')
  })

  it('AdapterConfig accepts empty config', () => {
    const cfg: AdapterConfig = {}
    expect(cfg.endpoint).toBeUndefined()
  })

  it('RawDiscoveryModel is structurally valid', () => {
    const rdm: RawDiscoveryModel = { protocol: 'mcp', items: [], metadata: {} }
    expect(rdm.protocol).toBe('mcp')
  })

  it('AdapterValidationResult valid=true', () => {
    const r: AdapterValidationResult = { valid: true, errors: [], warnings: [] }
    expect(r.valid).toBe(true)
  })

  it('AdapterValidationResult valid=false with errors', () => {
    const r: AdapterValidationResult = { valid: false, errors: ['bad schema'], warnings: [] }
    expect(r.errors).toHaveLength(1)
  })

  it('ExecutionBinding has adapterId and capabilityId', () => {
    const b: ExecutionBinding = {
      adapterId: 'mcp-adapter',
      capabilityId: 'filesystem.read',
      invoke: async (_input: unknown) => ({ ok: true }),
    }
    expect(b.adapterId).toBe('mcp-adapter')
    expect(b.capabilityId).toBe('filesystem.read')
  })

  it('InstallSource has scheme and location', () => {
    const s: InstallSource = { scheme: 'file', location: '/home/user/skill' }
    expect(s.scheme).toBe('file')
  })

  it('CapabilityAdapter satisfies interface', () => {
    const adapter: CapabilityAdapter = {
      id: 'mcp',
      protocol: 'mcp',
      version: '1.0',
      discover: async (_cfg: AdapterConfig) => ({ protocol: 'mcp', items: [], metadata: {} }),
      validate: (_raw: RawDiscoveryModel): AdapterValidationResult => ({ valid: true, errors: [], warnings: [] }),
    }
    expect(adapter.id).toBe('mcp')
    expect(adapter.protocol).toBe('mcp')
  })

  it('CapabilityAdapter discover returns RawDiscoveryModel', async () => {
    const adapter: CapabilityAdapter = {
      id: 'test',
      protocol: 'mcp',
      version: '1.0',
      discover: async () => ({ protocol: 'mcp', items: [{ name: 'read_file' }], metadata: { version: '1' } }),
      validate: (): AdapterValidationResult => ({ valid: true, errors: [], warnings: [] }),
    }
    const result = await adapter.discover({})
    expect(result.items).toHaveLength(1)
  })
})
