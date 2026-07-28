import * as path from 'node:path'
import type {
  WorkspaceRelativePath,
  StagingRelativePath,
  PackageStoreLocation,
  ProvisioningWorkspace,
} from '@rohinik-org/provisioning-ir'

export class SafeWorkspace {
  constructor(
    readonly workspace: ProvisioningWorkspace,
    readonly realRoot: string,
    readonly platform: NodeJS.Platform = process.platform,
  ) {}

  // Returns absolute path for an EXISTING path within workspace
  // Throws if path escapes workspace boundary
  resolveExistingPath(relative: WorkspaceRelativePath | StagingRelativePath | PackageStoreLocation): string {
    return this.resolve(String(relative))
  }

  // Returns absolute path for a NEW path within workspace (parent dir must exist; target need not)
  resolveNewPath(relative: WorkspaceRelativePath | StagingRelativePath | PackageStoreLocation): string {
    return this.resolve(String(relative))
  }

  private resolve(relative: string): string {
    // Security check: use path.relative, NOT startsWith
    // Bug: '/work/root-evil'.startsWith('/work/root') === true (false positive)
    // Fix: path.relative('/work/root', '/work/root-evil') === '../root-evil' (correct)
    const absolute = path.resolve(this.realRoot, relative)
    const rel = path.relative(this.realRoot, absolute)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`SafeWorkspace: path escape attempt: '${relative}' resolves outside workspace root`)
    }

    // Windows-specific checks (platform-gated)
    if (this.platform === 'win32') {
      this.checkWindowsDeviceName(path.basename(absolute))
      this.checkWindowsADS(relative)
    }

    return absolute
  }

  private checkWindowsDeviceName(name: string): void {
    // Windows device names: CON, PRN, AUX, NUL, COM0-COM9, LPT0-LPT9
    if (/^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\..*)?$/i.test(name)) {
      throw new Error(`SafeWorkspace: Windows device name not allowed: '${name}'`)
    }
  }

  private checkWindowsADS(relative: string): void {
    // Windows Alternate Data Streams: path contains ':'
    // (drive letter colon already excluded by resolve check)
    if (relative.includes(':')) {
      throw new Error(`SafeWorkspace: Windows ADS (colon in path) not allowed: '${relative}'`)
    }
  }
}
// ponytail: hard-link limitation — SafeWorkspace does not detect hard links targeting files outside the workspace.
// Files with nlink > 1 in the package store are flagged as warnings in immutable-mode drift detection (Stage 9I).
