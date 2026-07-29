import { describe, it, expect } from 'vitest'
import { parsePermissionDeclarations } from '../permission-declaration-parser.js'

describe('permission-declaration-parser', () => {
  it('parses a valid single permission', () => {
    const result = parsePermissionDeclarations([{ domain: 'filesystem', value: '/tmp' }])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.parsed).toHaveLength(1)
      expect(result.value.duplicateExact).toHaveLength(0)
      expect(result.value.conflicting).toHaveLength(0)
    }
  })

  it('parses empty array', () => {
    const result = parsePermissionDeclarations([])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.parsed).toHaveLength(0)
    }
  })

  it('rejects non-array input', () => {
    const result = parsePermissionDeclarations('bad' as unknown as [])
    expect(result.ok).toBe(false)
  })

  it('rejects permission with empty domain', () => {
    const result = parsePermissionDeclarations([{ domain: '', value: '/tmp' }])
    expect(result.ok).toBe(false)
  })

  it('rejects permission with empty value', () => {
    const result = parsePermissionDeclarations([{ domain: 'filesystem', value: '' }])
    expect(result.ok).toBe(false)
  })

  it('detects exact duplicates', () => {
    const perms = [
      { domain: 'filesystem', value: '/tmp' },
      { domain: 'filesystem', value: '/tmp' },
    ]
    const result = parsePermissionDeclarations(perms)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.duplicateExact).toHaveLength(1)
    }
  })

  it('detects conflicting: unconstrained vs constrained same domain+value', () => {
    const perms = [
      { domain: 'filesystem', value: '/data' },
      { domain: 'filesystem', value: '/data', resourceConstraint: 'read' },
    ]
    const result = parsePermissionDeclarations(perms)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.conflicting).toHaveLength(2)
    }
  })

  it('does not flag two different values as conflicting', () => {
    const perms = [
      { domain: 'filesystem', value: '/tmp' },
      { domain: 'filesystem', value: '/data' },
    ]
    const result = parsePermissionDeclarations(perms)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.conflicting).toHaveLength(0)
    }
  })
})
