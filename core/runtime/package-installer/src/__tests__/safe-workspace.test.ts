import { describe, it, expect } from 'vitest'
import * as path from 'node:path'
import { SafeWorkspace } from '../safe-workspace.js'
import type { ProvisioningWorkspace } from '@rohinik-org/provisioning-ir'

function makeWorkspace(root: string): ProvisioningWorkspace {
  return {
    workspaceId: 'test',
    root: root as import('@rohinik-org/provisioning-ir').WorkspaceRoot,
    quarantineRoot: 'quarantine' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath,
    stagingRoot: 'staging' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath,
    packageStoreRoot: 'packages' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath,
    modelStoreRoot: 'models' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath,
  }
}

// Use a native absolute path so path.resolve works correctly on Windows
const ROOT = path.resolve('C:/work/root')

function sw(platform: NodeJS.Platform = 'linux'): SafeWorkspace {
  return new SafeWorkspace(makeWorkspace(ROOT), ROOT, platform)
}

describe('SafeWorkspace', () => {
  // ── Happy-path containment ────────────────────────────────────────────────

  it('resolves a normal path within workspace', () => {
    const result = sw().resolveExistingPath('packages/foo' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath)
    expect(result).toBe(path.resolve(ROOT, 'packages/foo'))
  })

  it('resolves a deep nested path', () => {
    const result = sw().resolveNewPath('packages/a/b/c/d' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath)
    expect(result).toBe(path.resolve(ROOT, 'packages/a/b/c/d'))
  })

  it('resolves workspace root itself (empty string)', () => {
    // Empty string or '.' resolves to the root — allowed
    const result = sw().resolveNewPath('' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath)
    expect(result).toBe(ROOT)
  })

  it('resolves workspace root itself (dot)', () => {
    const result = sw().resolveNewPath('.' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath)
    expect(result).toBe(ROOT)
  })

  // ── Path traversal ────────────────────────────────────────────────────────

  it('throws on single-level path traversal ../outside', () => {
    expect(() => sw().resolveExistingPath('../outside' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath))
      .toThrow(/path escape attempt/)
  })

  it('throws on deep path traversal ../../outside', () => {
    expect(() => sw().resolveExistingPath('../../outside' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath))
      .toThrow(/path escape attempt/)
  })

  it('throws on traversal embedded inside path: foo/../../outside', () => {
    expect(() => sw().resolveExistingPath('foo/../../outside' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath))
      .toThrow(/path escape attempt/)
  })

  // ── The classic startsWith bug ─────────────────────────────────────────────
  // '/work/root-evil'.startsWith('/work/root') === true (BUG)
  // path.relative('/work/root', '/work/root-evil') === '../root-evil' (CORRECT)

  it('rejects sibling directory with same prefix as root (startsWith bug)', () => {
    // path.relative(ROOT, ROOT + '-evil') === '../root-evil' which starts with '..'
    // A startsWith check would incorrectly pass this
    const siblingAbsolute = ROOT + '-evil'
    // Turn into a "relative" string that path.resolve would treat as absolute on POSIX
    // We need to pass something that resolves to the sibling. Since path.resolve is used,
    // passing an absolute path as the relative arg does just that.
    expect(() => sw().resolveExistingPath(siblingAbsolute as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath))
      .toThrow(/path escape attempt/)
  })

  // ── Windows device names (platform='win32') ───────────────────────────────

  it('throws on Windows device name CON when platform=win32', () => {
    expect(() => sw('win32').resolveExistingPath('packages/CON' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath))
      .toThrow(/Windows device name/)
  })

  it('throws on Windows device name NUL.txt when platform=win32', () => {
    expect(() => sw('win32').resolveExistingPath('packages/NUL.txt' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath))
      .toThrow(/Windows device name/)
  })

  it('throws on Windows device name COM1 when platform=win32', () => {
    expect(() => sw('win32').resolveExistingPath('COM1' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath))
      .toThrow(/Windows device name/)
  })

  it('device name check NOT run on linux — CON passes', () => {
    // On Linux, 'CON' is a valid filename
    const result = sw('linux').resolveExistingPath('packages/CON' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath)
    expect(result).toBe(path.resolve(ROOT, 'packages/CON'))
  })

  // ── Windows ADS (platform='win32') ───────────────────────────────────────

  it('throws on Windows ADS (colon in relative path) when platform=win32', () => {
    expect(() => sw('win32').resolveExistingPath('file:stream' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath))
      .toThrow(/Windows ADS/)
  })

  it('ADS check NOT run on linux — colon in path passes', () => {
    // On Linux, ':' in a filename is valid
    const result = sw('linux').resolveExistingPath('file:stream' as import('@rohinik-org/provisioning-ir').WorkspaceRelativePath)
    expect(result).toBe(path.resolve(ROOT, 'file:stream'))
  })
})
