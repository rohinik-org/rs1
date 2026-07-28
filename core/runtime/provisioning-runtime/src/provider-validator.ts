import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  AuthorizedValidateProviderAction,
  InstalledProviderHandle,
  ProviderValidationResult,
  ProvisioningDiagnosticCode,
} from '@rohinik-org/provisioning-ir'

export class ProviderValidator {
  async validate(
    action: AuthorizedValidateProviderAction,
    providerHandle: InstalledProviderHandle,
  ): Promise<ProviderValidationResult> {
    const probe = action.probe
    if (probe.kind === 'manifest-check') {
      return this.checkManifest(providerHandle.installPath)
    }
    if (probe.kind === 'entrypoint-exists') {
      return this.checkEntrypoint(providerHandle.installPath, probe.entrypoint)
    }
    throw new Error(`ProviderValidator invariant: unknown probe kind '${(probe as { kind: string }).kind}'`)
  }

  private async checkManifest(installPath: string): Promise<ProviderValidationResult> {
    try {
      const raw = await readFile(join(installPath, 'package.json'), 'utf8')
      const parsed = JSON.parse(raw) as unknown
      if (typeof parsed === 'object' && parsed !== null && typeof (parsed as Record<string, unknown>)['name'] === 'string') {
        return { passed: true, diagnosticCodes: [] }
      }
    } catch {
      // file missing or invalid JSON
    }
    return { passed: false, diagnosticCodes: ['PROVIDER_MANIFEST_MISSING' as ProvisioningDiagnosticCode] }
  }

  private async checkEntrypoint(installPath: string, entrypoint: string): Promise<ProviderValidationResult> {
    try {
      await access(join(installPath, entrypoint))
      return { passed: true, diagnosticCodes: [] }
    } catch {
      return { passed: false, diagnosticCodes: ['PROVIDER_ENTRYPOINT_MISSING' as ProvisioningDiagnosticCode] }
    }
  }
}
