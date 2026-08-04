import { describe, it, expect } from 'vitest'
import { RegistrationPipeline } from '../registration-pipeline.js'
import type { SdkCapability } from '@rohinik-org/foundation'

function makeCapability(id: string): SdkCapability {
  return {
    metadata: {
      capabilityId: id,
      name: id,
      version: '1.0.0',
      contractVersion: '1.0',
      description: '',
      category: 'tool',
      tags: [],
      execution: { tierId: 'LOCAL_TOOL' },
    },
    skills: [],
  }
}

describe('RegistrationPipeline', () => {
  it('admits valid capabilities', () => {
    const pipeline = new RegistrationPipeline('0.1.0', '1.0')
    const record = pipeline.admit([makeCapability('filesystem.read')], 'session-1', 'snapshot-1', 'desc-1')
    expect(record.status).toBe('ADMITTED')
    expect(record.registeredCapabilityIds).toContain('filesystem.read')
  })

  it('rejects empty capabilities', () => {
    const pipeline = new RegistrationPipeline('0.1.0', '1.0')
    const record = pipeline.admit([], 'session-1', 'snapshot-1', 'desc-1')
    expect(record.status).toBe('REJECTED')
    expect(record.errors).toContain('No capabilities to register')
  })

  it('warns on duplicate capability IDs', () => {
    const pipeline = new RegistrationPipeline('0.1.0', '1.0')
    const record = pipeline.admit(
      [makeCapability('filesystem.read'), makeCapability('filesystem.read')],
      'session-1', 'snapshot-1', 'desc-1',
    )
    expect(record.status).toBe('ADMITTED')
    expect(record.warnings).toBeDefined()
    expect(record.warnings?.some(w => w.includes('Duplicate'))).toBe(true)
  })

  it('record has valid meta fields', () => {
    const pipeline = new RegistrationPipeline('0.1.0', '1.0')
    const record = pipeline.admit([makeCapability('math.add')], 'session-1', 'snapshot-1', 'desc-1')
    expect(record.meta.kind).toBe('RegistrationRecord')
    expect(record.integrity.checksum).toBeTruthy()
  })
})
