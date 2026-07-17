import { describe, it, expect } from 'vitest'
import type { SdkCapabilityMetadata, SdkSkillMetadata } from '../metadata.js'

describe('SDK metadata types', () => {
  it('accepts valid capability metadata', () => {
    const meta: SdkCapabilityMetadata = {
      capabilityId: 'csv',
      name: 'CSV',
      version: '1.0.0',
      contractVersion: '1.0',
      description: 'CSV parsing and manipulation',
      category: 'data',
      tags: ['csv', 'parsing', 'data'],
    }
    expect(meta.category).toBe('data')
  })

  it('accepts valid skill metadata', () => {
    const meta: SdkSkillMetadata = {
      skillId: 'csv.parse',
      name: 'CSV Parse',
      version: '1.0.0',
      description: 'Parse CSV text into rows and columns',
      tags: ['csv', 'parse'],
      costTier: 'free',
      latencyTier: 'very-low',
      examples: ['Parse "a,b\\n1,2" into [{a:"1",b:"2"}]'],
    }
    expect(meta.costTier).toBe('free')
  })
})
