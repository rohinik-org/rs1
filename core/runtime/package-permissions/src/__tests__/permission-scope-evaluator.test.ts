import { describe, it, expect } from 'vitest'
import { evaluatePermissionScope } from '../permission-scope-evaluator.js'
import type { PermissionPolicy, PermissionExecutionContext } from '../types.js'

const strictPolicy: PermissionPolicy = { rules: [], defaultEffect: 'deny', enforcementCapabilities: [] }
const wildcardPolicy: PermissionPolicy = { rules: [], defaultEffect: 'deny', enforcementCapabilities: [], allowWildcardsByDefault: true }
const emptyContext: PermissionExecutionContext = {}

describe('permission-scope-evaluator', () => {
  describe('filesystem', () => {
    it('allows valid path', () => {
      expect(evaluatePermissionScope({ domain: 'filesystem', value: '/tmp/work' }, strictPolicy, emptyContext).valid).toBe(true)
    })

    it('rejects path traversal', () => {
      expect(evaluatePermissionScope({ domain: 'filesystem', value: '../etc' }, strictPolicy, emptyContext).valid).toBe(false)
    })

    it('rejects root / without wildcard policy', () => {
      expect(evaluatePermissionScope({ domain: 'filesystem', value: '/' }, strictPolicy, emptyContext).valid).toBe(false)
    })

    it('rejects * without wildcard policy', () => {
      expect(evaluatePermissionScope({ domain: 'filesystem', value: '*' }, strictPolicy, emptyContext).valid).toBe(false)
    })

    it('allows / with wildcard policy', () => {
      expect(evaluatePermissionScope({ domain: 'filesystem', value: '/' }, wildcardPolicy, emptyContext).valid).toBe(true)
    })

    it('rejects path outside filesystemRoots', () => {
      const ctx: PermissionExecutionContext = { filesystemRoots: ['/app'] }
      expect(evaluatePermissionScope({ domain: 'filesystem', value: '/etc' }, strictPolicy, ctx).valid).toBe(false)
    })

    it('allows path within filesystemRoots', () => {
      const ctx: PermissionExecutionContext = { filesystemRoots: ['/app'] }
      expect(evaluatePermissionScope({ domain: 'filesystem', value: '/app/data' }, strictPolicy, ctx).valid).toBe(true)
    })
  })

  describe('network', () => {
    it('allows specific hostname', () => {
      expect(evaluatePermissionScope({ domain: 'network', value: 'api.example.com' }, strictPolicy, emptyContext).valid).toBe(true)
    })

    it('rejects * without wildcard policy', () => {
      expect(evaluatePermissionScope({ domain: 'network', value: '*' }, strictPolicy, emptyContext).valid).toBe(false)
    })

    it('allows * with wildcard policy', () => {
      expect(evaluatePermissionScope({ domain: 'network', value: '*' }, wildcardPolicy, emptyContext).valid).toBe(true)
    })

    it('rejects 0.0.0.0/0', () => {
      expect(evaluatePermissionScope({ domain: 'network', value: '0.0.0.0/0' }, strictPolicy, emptyContext).valid).toBe(false)
    })

    it('rejects invalid port in resourceConstraint', () => {
      expect(evaluatePermissionScope({ domain: 'network', value: 'api.example.com', resourceConstraint: ':99999' }, strictPolicy, emptyContext).valid).toBe(false)
    })

    it('allows valid port', () => {
      expect(evaluatePermissionScope({ domain: 'network', value: 'api.example.com', resourceConstraint: ':443' }, strictPolicy, emptyContext).valid).toBe(true)
    })
  })

  describe('secret', () => {
    it('rejects * global access', () => {
      expect(evaluatePermissionScope({ domain: 'secret', value: '*' }, strictPolicy, emptyContext).valid).toBe(false)
    })

    it('allows scoped secret without tenantId context', () => {
      expect(evaluatePermissionScope({ domain: 'secret', value: 'my-secret' }, strictPolicy, emptyContext).valid).toBe(true)
    })

    it('rejects secret not matching tenantId', () => {
      const ctx: PermissionExecutionContext = { tenantId: 'tenant-a' }
      expect(evaluatePermissionScope({ domain: 'secret', value: 'tenant-b/secret' }, strictPolicy, ctx).valid).toBe(false)
    })

    it('allows secret matching tenantId', () => {
      const ctx: PermissionExecutionContext = { tenantId: 'tenant-a' }
      expect(evaluatePermissionScope({ domain: 'secret', value: 'tenant-a/my-secret' }, strictPolicy, ctx).valid).toBe(true)
    })
  })

  describe('process', () => {
    it('rejects * arbitrary execution', () => {
      expect(evaluatePermissionScope({ domain: 'process', value: '*' }, strictPolicy, emptyContext).valid).toBe(false)
    })

    it('rejects /bin/sh', () => {
      expect(evaluatePermissionScope({ domain: 'process', value: '/bin/sh' }, strictPolicy, emptyContext).valid).toBe(false)
    })

    it('rejects /bin/bash', () => {
      expect(evaluatePermissionScope({ domain: 'process', value: '/bin/bash' }, strictPolicy, emptyContext).valid).toBe(false)
    })

    it('rejects cmd.exe', () => {
      expect(evaluatePermissionScope({ domain: 'process', value: 'cmd.exe' }, strictPolicy, emptyContext).valid).toBe(false)
    })

    it('allows non-shell executable', () => {
      expect(evaluatePermissionScope({ domain: 'process', value: '/usr/bin/node' }, strictPolicy, emptyContext).valid).toBe(true)
    })
  })

  describe('device', () => {
    it('rejects * without wildcard policy', () => {
      expect(evaluatePermissionScope({ domain: 'device', value: '*' }, strictPolicy, emptyContext).valid).toBe(false)
    })

    it('allows specific device', () => {
      expect(evaluatePermissionScope({ domain: 'device', value: 'camera' }, strictPolicy, emptyContext).valid).toBe(true)
    })
  })

  describe('other domains', () => {
    it('allows non-empty value', () => {
      expect(evaluatePermissionScope({ domain: 'runtime-hook', value: 'on-start' }, strictPolicy, emptyContext).valid).toBe(true)
    })
  })
})
