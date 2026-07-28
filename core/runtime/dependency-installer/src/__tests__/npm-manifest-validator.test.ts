import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { NpmManifestValidator } from '../npm-manifest-validator.js'
import type { AuthorizedNpmInstallManifest, NpmInstallManifestHash } from '@rohinik-org/provisioning-ir'
import { PlanStructureError } from '@rohinik-org/provisioning-ir'

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

function semanticHash(content: string): string {
  return sha256Hex(JSON.stringify(JSON.parse(content)))
}

const PKG_JSON = JSON.stringify({ name: 'test', version: '1.0.0' })
const LOCK_JSON = JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/lodash': { version: '4.17.21' } } })

function makeManifest(overrides: Partial<AuthorizedNpmInstallManifest> = {}): AuthorizedNpmInstallManifest {
  const pkgHash = semanticHash(PKG_JSON)
  const lockHash = semanticHash(LOCK_JSON)
  return {
    ecosystem: 'npm',
    lockfileVersion: 3,
    packageJsonCanonicalContent: PKG_JSON,
    packageJsonSemanticHash: pkgHash,
    packageLockCanonicalContent: LOCK_JSON,
    packageLockSemanticHash: lockHash,
    packageRecords: [{
      packagePath: 'node_modules/lodash',
      name: 'lodash',
      version: '4.17.21',
      resolvedArtifact: { sourceKind: 'uri', uri: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz' },
      integrity: { algorithm: 'sha256', encoding: 'hex', value: 'abc123' },
      optional: false,
      dev: false,
      expectedDisposition: 'installed',
    }],
    semanticHash: sha256Hex('test-manifest').padEnd(64, '0').slice(0, 64) as NpmInstallManifestHash,
    ...overrides,
  }
}

describe('NpmManifestValidator', () => {
  const v = new NpmManifestValidator()

  it('T-V1: valid manifest passes without throw', () => {
    expect(() => v.validate(makeManifest())).not.toThrow()
  })

  it('T-V2: ecosystem !== npm throws PlanStructureError', () => {
    const m = makeManifest({ ecosystem: 'pip' as 'npm' })
    expect(() => v.validate(m)).toThrow(PlanStructureError)
  })

  it('T-V3: lockfileVersion !== 3 throws PlanStructureError', () => {
    const m = makeManifest({ lockfileVersion: 2 as 3 })
    expect(() => v.validate(m)).toThrow(PlanStructureError)
  })

  it('T-V4: packageJsonCanonicalContent invalid JSON throws PlanStructureError', () => {
    const m = makeManifest({ packageJsonCanonicalContent: 'not-json' })
    expect(() => v.validate(m)).toThrow(PlanStructureError)
  })

  it('T-V5: tampered packageJsonSemanticHash throws PlanStructureError', () => {
    const m = makeManifest({ packageJsonSemanticHash: 'deadbeef'.repeat(8) })
    expect(() => v.validate(m)).toThrow(PlanStructureError)
  })

  it('T-V6: packageLockCanonicalContent invalid JSON throws PlanStructureError', () => {
    const m = makeManifest({ packageLockCanonicalContent: '{bad' })
    expect(() => v.validate(m)).toThrow(PlanStructureError)
  })

  it('T-V7: tampered packageLockSemanticHash throws PlanStructureError', () => {
    const m = makeManifest({ packageLockSemanticHash: 'deadbeef'.repeat(8) })
    expect(() => v.validate(m)).toThrow(PlanStructureError)
  })

  it('T-V8: record packagePath not in lockfile packages throws PlanStructureError', () => {
    const m = makeManifest({
      packageRecords: [{
        packagePath: 'node_modules/nonexistent',
        name: 'nonexistent',
        version: '1.0.0',
        resolvedArtifact: { sourceKind: 'uri', uri: 'https://example.com' },
        integrity: { algorithm: 'sha256', encoding: 'hex', value: 'abc' },
        optional: false,
        dev: false,
        expectedDisposition: 'installed',
      }],
    })
    expect(() => v.validate(m)).toThrow(PlanStructureError)
  })
})
