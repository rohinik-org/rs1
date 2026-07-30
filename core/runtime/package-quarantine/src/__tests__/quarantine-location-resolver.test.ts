import { describe, it, expect } from 'vitest'
import { resolveQuarantineLocation } from '../quarantine-location-resolver.js'
import { makeSubject } from './fixtures.js'

describe('QuarantineLocationResolver', () => {
  it('builds path from default namespace', () => {
    const path = resolveQuarantineLocation(makeSubject(), {}, 'op-1')
    expect(path).toBe('quarantine/test-pkg/1.0.0/op-1')
  })

  it('uses namespacePrefix from context', () => {
    const path = resolveQuarantineLocation(makeSubject(), { namespacePrefix: 'tenant-x/quarantine' }, 'op-1')
    expect(path).toBe('tenant-x/quarantine/test-pkg/1.0.0/op-1')
  })

  it('rejects absolute path', () => {
    expect(() => resolveQuarantineLocation(makeSubject(), { namespacePrefix: '/absolute' }, 'op-1')).toThrow()
  })

  it('sanitizes .. in packageId', () => {
    const path = resolveQuarantineLocation(makeSubject('pkg/../evil'), {}, 'op-1')
    expect(path).not.toContain('..')
  })

  it('sanitizes slashes in packageId', () => {
    const path = resolveQuarantineLocation(makeSubject('@scope/pkg'), {}, 'op-1')
    expect(path).not.toContain('//')
  })

  it('rejects path containing ..', () => {
    // Force a .. by making namespacePrefix have ..
    expect(() => resolveQuarantineLocation(makeSubject(), { namespacePrefix: 'good/../evil' }, 'op-1')).toThrow('..')
  })
})
