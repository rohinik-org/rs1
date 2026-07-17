import { describe, it, expect } from 'vitest'
import { Capability } from '../plugins/capability-base.js'
import type { SdkCapabilityMetadata, SdkSkill, Runtime } from '../index.js'

class TestCapability extends Capability {
  readonly metadata: SdkCapabilityMetadata = {
    capabilityId: 'test', name: 'Test', version: '0.1.0',
    category: 'INFERENCE', description: '', author: 'test',
    costTier: 'FREE', latencyTier: 'FAST',
    skills: [],
  }
  readonly skills: readonly SdkSkill[] = []
}

describe('Capability base class', () => {
  it('can be subclassed and instantiated', () => {
    const cap = new TestCapability()
    expect(cap.metadata.capabilityId).toBe('test')
  })

  it('activate is a no-op by default', async () => {
    const cap = new TestCapability()
    const result = cap.activate({} as Runtime)
    await expect(Promise.resolve(result)).resolves.toBeUndefined()
  })

  it('deactivate is a no-op by default', async () => {
    const cap = new TestCapability()
    const result = cap.deactivate()
    await expect(Promise.resolve(result)).resolves.toBeUndefined()
  })

  it('activate can be overridden', async () => {
    let activated = false
    class CustomCap extends TestCapability {
      override activate(_runtime: Runtime): void { activated = true }
    }
    const cap = new CustomCap()
    await cap.activate({} as Runtime)
    expect(activated).toBe(true)
  })

  it('skills array is readonly', () => {
    const cap = new TestCapability()
    expect(Array.isArray(cap.skills)).toBe(true)
  })

  it('implements SdkCapability interface', () => {
    const cap: import('../index.js').SdkCapability = new TestCapability()
    expect(cap.metadata).toBeDefined()
    expect(cap.skills).toBeDefined()
  })
})
