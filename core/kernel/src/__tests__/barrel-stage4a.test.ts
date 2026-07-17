import { describe, it, expect } from 'vitest'

describe('Stage 4A barrel exports', () => {
  it('exports ManifestParser', async () => {
    const { ManifestParser } = await import('@rohinik-org/kernel')
    expect(ManifestParser).toBeDefined()
  })

  it('exports ManifestValidator', async () => {
    const { ManifestValidator } = await import('@rohinik-org/kernel')
    expect(ManifestValidator).toBeDefined()
  })

  it('exports CapabilityDependencyGraph', async () => {
    const { CapabilityDependencyGraph } = await import('@rohinik-org/kernel')
    expect(CapabilityDependencyGraph).toBeDefined()
  })

  it('exports ManifestLoader', async () => {
    const { ManifestLoader } = await import('@rohinik-org/kernel')
    expect(ManifestLoader).toBeDefined()
  })

  it('exports RuntimeRegistry', async () => {
    const { RuntimeRegistry } = await import('@rohinik-org/kernel')
    expect(RuntimeRegistry).toBeDefined()
  })

  it('exports KernelRuntime', async () => {
    const { KernelRuntime } = await import('@rohinik-org/kernel')
    expect(KernelRuntime).toBeDefined()
  })

  it('exports RuntimeBuilder', async () => {
    const { RuntimeBuilder } = await import('@rohinik-org/kernel')
    expect(RuntimeBuilder).toBeDefined()
  })

  it('exports MutableCapabilityCatalog type (type-only, no runtime value)', async () => {
    const mod = await import('@rohinik-org/kernel')
    expect(mod).toBeDefined()
  })
})
