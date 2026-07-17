import semver from 'semver'
import type { AiosManifest } from '@rohinik-org/foundation'
import type { ManifestConfig } from '../domain/config.js'

export interface ValidationResult {
  readonly valid: boolean
  readonly warnings: readonly string[]
  readonly errors: readonly string[]
}

const ACTIVATED_TYPES = new Set(['capability', 'provider'])
const KNOWN_FEATURES = new Set<string>()  // Phase 1: no known features; all produce warnings

export class ManifestValidator {
  constructor(
    private readonly config: ManifestConfig,
    private readonly runtimeVersion: string,
  ) {}

  validate(manifest: AiosManifest): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // schemaVersion must start with '1.'
    if (!manifest.schemaVersion.startsWith('1.')) {
      errors.push(`schemaVersion '${manifest.schemaVersion}' is not supported; expected 1.*`)
    }

    // runtimeVersion must be a valid semver range satisfied by runtimeVersion
    const range = semver.validRange(manifest.runtimeVersion)
    if (range === null) {
      errors.push(`runtimeVersion '${manifest.runtimeVersion}' is not a valid semver range`)
    } else if (!semver.satisfies(this.runtimeVersion, range)) {
      errors.push(
        `runtimeVersion '${manifest.runtimeVersion}' is not satisfied by runtime version '${this.runtimeVersion}'`,
      )
    }

    // compatibility
    if (manifest.compatibility === 'experimental') {
      if (this.config.rejectExperimental) {
        errors.push(`compatibility 'experimental' is rejected by runtime configuration`)
      } else {
        warnings.push(`Extension '${manifest.id}' uses experimental compatibility — may change without notice`)
      }
    } else if (manifest.compatibility === 'deprecated') {
      warnings.push(`Extension '${manifest.id}' is deprecated — consider replacing it`)
    }

    // type — warn for types not activated in Phase 1
    if (!ACTIVATED_TYPES.has(manifest.type)) {
      warnings.push(
        `Extension '${manifest.id}' has type '${manifest.type}' which is recognized but not activated in Phase 1`,
      )
    }

    // requiresFeatures — warn for unknown features (enforcement is Phase 3+)
    for (const feature of manifest.requiresFeatures ?? []) {
      if (!KNOWN_FEATURES.has(feature)) {
        warnings.push(`Extension '${manifest.id}' requires unknown feature '${feature}' — will be ignored in Phase 1`)
      }
    }

    return { valid: errors.length === 0, warnings, errors }
  }
}
