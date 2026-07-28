import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type {
  AuthorizedValidateProviderAction,
  InstalledProviderHandle,
  ProvisioningActionId,
  AuthorizationId,
  AuthorizationDecisionId,
  PackageId,
  WorkspaceRelativePath,
  PackageRelativePath,
} from '@rohinik-org/provisioning-ir'
import { ProviderValidator } from '../provider-validator.js'

const aid = (s: string) => s as ProvisioningActionId
const authId = (s: string) => s as AuthorizationId
const decId = (s: string) => s as AuthorizationDecisionId

function makeAction(probe: AuthorizedValidateProviderAction['probe']): AuthorizedValidateProviderAction {
  return {
    kind: 'validate-provider',
    actionId: aid('a1'),
    providerId: 'test-provider',
    probe,
    dependsOn: [],
    authorization: {
      authorizationId: authId('auth-1'),
      authorizationDecisionId: decId('dec-1'),
      authorizedTargetHash: 'hash',
    },
    mutationPolicy: { mutating: false },
  }
}

function makeHandle(installPath: string): InstalledProviderHandle {
  return {
    providerId: 'test-provider',
    packageId: 'pkg-test' as PackageId,
    version: '1.0.0',
    installPath: installPath as WorkspaceRelativePath,
  }
}

describe('ProviderValidator', () => {
  let dir: string
  let validator: ProviderValidator

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pv-test-'))
    validator = new ProviderValidator()
  })

  describe('manifest-check probe', () => {
    it('passes when package.json exists and has name field', async () => {
      await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'test-provider', version: '1.0.0' }))
      const result = await validator.validate(makeAction({ kind: 'manifest-check' }), makeHandle(dir))
      expect(result.passed).toBe(true)
      expect(result.diagnosticCodes).toHaveLength(0)
    })

    it('fails with PROVIDER_MANIFEST_MISSING when package.json absent', async () => {
      const result = await validator.validate(makeAction({ kind: 'manifest-check' }), makeHandle(dir))
      expect(result.passed).toBe(false)
      expect(result.diagnosticCodes).toContain('PROVIDER_MANIFEST_MISSING')
    })

    it('fails with PROVIDER_MANIFEST_MISSING when package.json is invalid JSON', async () => {
      await writeFile(join(dir, 'package.json'), 'not json {{{')
      const result = await validator.validate(makeAction({ kind: 'manifest-check' }), makeHandle(dir))
      expect(result.passed).toBe(false)
      expect(result.diagnosticCodes).toContain('PROVIDER_MANIFEST_MISSING')
    })

    it('fails with PROVIDER_MANIFEST_MISSING when package.json has no name field', async () => {
      await writeFile(join(dir, 'package.json'), JSON.stringify({ version: '1.0.0' }))
      const result = await validator.validate(makeAction({ kind: 'manifest-check' }), makeHandle(dir))
      expect(result.passed).toBe(false)
      expect(result.diagnosticCodes).toContain('PROVIDER_MANIFEST_MISSING')
    })
  })

  describe('entrypoint-exists probe', () => {
    it('passes when entrypoint file exists', async () => {
      await writeFile(join(dir, 'index.js'), 'export default {}')
      const probe = { kind: 'entrypoint-exists' as const, entrypoint: 'index.js' as PackageRelativePath }
      const result = await validator.validate(makeAction(probe), makeHandle(dir))
      expect(result.passed).toBe(true)
      expect(result.diagnosticCodes).toHaveLength(0)
    })

    it('fails with PROVIDER_ENTRYPOINT_MISSING when entrypoint absent', async () => {
      const probe = { kind: 'entrypoint-exists' as const, entrypoint: 'missing.js' as PackageRelativePath }
      const result = await validator.validate(makeAction(probe), makeHandle(dir))
      expect(result.passed).toBe(false)
      expect(result.diagnosticCodes).toContain('PROVIDER_ENTRYPOINT_MISSING')
    })

    it('passes when entrypoint is in subdirectory', async () => {
      await mkdir(join(dir, 'dist'), { recursive: true })
      await writeFile(join(dir, 'dist', 'index.js'), 'export default {}')
      const probe = { kind: 'entrypoint-exists' as const, entrypoint: 'dist/index.js' as PackageRelativePath }
      const result = await validator.validate(makeAction(probe), makeHandle(dir))
      expect(result.passed).toBe(true)
    })
  })

  describe('invariant: unknown probe kind', () => {
    it('throws invariant error for unknown probe kind', async () => {
      const badProbe = { kind: 'unknown-probe-kind' } as unknown as AuthorizedValidateProviderAction['probe']
      await expect(validator.validate(makeAction(badProbe), makeHandle(dir))).rejects.toThrow(
        /ProviderValidator invariant: unknown probe kind 'unknown-probe-kind'/,
      )
    })
  })
})
