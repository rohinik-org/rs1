import { describe, it, expect } from 'vitest'
import { resolveQuarantineMode } from '../quarantine-mode-resolver.js'
import { makePolicy } from './fixtures.js'
import type { QuarantineMode } from '../types.js'

describe('QuarantineModeResolver', () => {
  it('picks isolate first when available', () => {
    expect(resolveQuarantineMode(makePolicy({ allowedModes: ['isolate', 'seal'] }))).toBe('isolate')
  })

  it('picks copy-and-seal over seal', () => {
    expect(resolveQuarantineMode(makePolicy({ allowedModes: ['copy-and-seal', 'seal'], defaultMode: 'copy-and-seal' }))).toBe('copy-and-seal')
  })

  it('throws when no modes available', () => {
    expect(() => resolveQuarantineMode(makePolicy({ allowedModes: [] as unknown as QuarantineMode[] }))).toThrow()
  })

  it('does not select manual-containment unless allowManualContainment=true', () => {
    const policy = makePolicy({ allowedModes: ['manual-containment'], defaultMode: 'manual-containment', allowManualContainment: false })
    expect(() => resolveQuarantineMode(policy)).toThrow()
  })

  it('selects manual-containment when allowManualContainment=true', () => {
    const policy = makePolicy({ allowedModes: ['manual-containment'], defaultMode: 'manual-containment', allowManualContainment: true })
    expect(resolveQuarantineMode(policy)).toBe('manual-containment')
  })

  it('throws when weaker mode selected and no fallback allowed', () => {
    const policy = makePolicy({
      allowedModes: ['deny-activation'],
      defaultMode: 'isolate',
      allowCopyFallback: false,
      allowDegradedContainment: false,
    })
    expect(() => resolveQuarantineMode(policy)).toThrow()
  })

  it('allows weaker mode when allowCopyFallback=true', () => {
    const policy = makePolicy({
      allowedModes: ['deny-activation'],
      defaultMode: 'isolate',
      allowCopyFallback: true,
    })
    expect(resolveQuarantineMode(policy)).toBe('deny-activation')
  })
})
