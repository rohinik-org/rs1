import { describe, it, expect } from 'vitest'
import { DefaultPolicyEngine } from '../policy-engine.js'
import type { RohiniKPackageManifest } from '@rohinik-org/compiler'

const BASE_MANIFEST: RohiniKPackageManifest = {
  schemaVersion: '2.0', id: '@test/pkg', version: '1.0.0', type: 'adapter',
  name: 'Test', description: 'Test', minimumRuntime: '>=0.1.0', minimumSdk: '1.0',
}

describe('DefaultPolicyEngine', () => {
  it('allows everything when no policy configured', () => {
    const result = new DefaultPolicyEngine().check(BASE_MANIFEST, { scheme: 'npm', location: '@test/pkg' })
    expect(result.allowed).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('blocks source not in allowedSources', () => {
    const result = new DefaultPolicyEngine({ allowedSources: ['file:'] }).check(BASE_MANIFEST, { scheme: 'npm', location: '@test/pkg' })
    expect(result.allowed).toBe(false)
    expect(result.findings[0]!.code).toBe('SOURCE_NOT_ALLOWED')
  })

  it('blocks a blocked package ID', () => {
    const result = new DefaultPolicyEngine({ blockedIds: ['@test/pkg'] }).check(BASE_MANIFEST, { scheme: 'file', location: './pkg' })
    expect(result.allowed).toBe(false)
    expect(result.findings[0]!.code).toBe('ID_BLOCKED')
  })

  it('blocks insufficient compliance level', () => {
    const manifest: RohiniKPackageManifest = { ...BASE_MANIFEST, compliance: { targetLevel: 1, laws: [], benchmarkSuites: [] } }
    const result = new DefaultPolicyEngine({ requiredComplianceLevel: 2 }).check(manifest, { scheme: 'file', location: '.' })
    expect(result.allowed).toBe(false)
    expect(result.findings[0]!.code).toBe('COMPLIANCE_LEVEL_INSUFFICIENT')
  })

  it('APPROVAL_REQUIRED is a warning not a block in v1', () => {
    const result = new DefaultPolicyEngine({ approvalRequired: true }).check(BASE_MANIFEST, { scheme: 'file', location: '.' })
    expect(result.allowed).toBe(true)
    expect(result.findings.some(f => f.code === 'APPROVAL_REQUIRED')).toBe(true)
  })

  it('blocks package without signature when requireSignature is true', () => {
    const result = new DefaultPolicyEngine({ requireSignature: true }).check(BASE_MANIFEST, { scheme: 'file', location: '.' })
    expect(result.allowed).toBe(false)
    expect(result.findings[0]!.code).toBe('SIGNATURE_REQUIRED')
  })
})
