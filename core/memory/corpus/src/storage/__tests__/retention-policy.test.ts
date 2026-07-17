import { describe, it, expect } from 'vitest'
import {
  DeveloperRetentionPolicy, DefaultRetentionPolicy,
  EnterpriseRetentionPolicy, ForensicsRetentionPolicy,
} from '../retention-policy.js'
import type { RetentionPolicy } from '../retention-policy.js'

describe('RetentionPolicy presets', () => {
  it('DeveloperRetentionPolicy has 7 day max', () => {
    expect(DeveloperRetentionPolicy.maxAgeDays).toBe(7)
    expect(DeveloperRetentionPolicy.maxSizeGb).toBe(0.1)
  })

  it('DefaultRetentionPolicy has 30 day max', () => {
    expect(DefaultRetentionPolicy.maxAgeDays).toBe(30)
    expect(DefaultRetentionPolicy.maxSizeGb).toBe(1)
  })

  it('EnterpriseRetentionPolicy enables archiving', () => {
    expect(EnterpriseRetentionPolicy.archiveAfterDays).toBe(90)
    expect(EnterpriseRetentionPolicy.compressArchive).toBe(true)
  })

  it('ForensicsRetentionPolicy has 730 day max', () => {
    expect(ForensicsRetentionPolicy.maxAgeDays).toBe(730)
  })

  it('RetentionPolicy type accepts custom values', () => {
    const policy: RetentionPolicy = {
      maxAgeDays: 14, maxSizeGb: 0.5, archiveAfterDays: 7, deleteAfterDays: 14,
    }
    expect(policy.maxAgeDays).toBe(14)
  })
})
