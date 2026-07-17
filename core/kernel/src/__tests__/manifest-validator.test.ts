import { describe, it, expect } from 'vitest'
import { ManifestValidator } from '../manifest/validator.js'
import type { ManifestConfig } from '../domain/config.js'
import type { AiosManifest } from '@rohinik-org/foundation'

const VALID_MANIFEST: AiosManifest = {
  schemaVersion: '1.0',
  runtimeVersion: '^0.1',
  type: 'capability',
  compatibility: 'stable',
  id: 'test-ext',
  name: 'Test Extension',
  version: '1.0.0',
  contractVersion: '1.0',
  entry: './src/index.js',
}

const defaultConfig: ManifestConfig = { rejectExperimental: false, scanPaths: [] }

describe('ManifestValidator', () => {
  describe('schemaVersion', () => {
    it('passes for schemaVersion matching 1.*', () => {
      const validator = new ManifestValidator(defaultConfig, '0.1.0')
      const result = validator.validate({ ...VALID_MANIFEST, schemaVersion: '1.0' })
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('passes for schemaVersion 1.5', () => {
      const validator = new ManifestValidator(defaultConfig, '0.1.0')
      const result = validator.validate({ ...VALID_MANIFEST, schemaVersion: '1.5' })
      expect(result.valid).toBe(true)
    })

    it('errors for schemaVersion 2.0', () => {
      const validator = new ManifestValidator(defaultConfig, '0.1.0')
      const result = validator.validate({ ...VALID_MANIFEST, schemaVersion: '2.0' })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('schemaVersion'))).toBe(true)
    })

    it('errors for schemaVersion 0.9', () => {
      const validator = new ManifestValidator(defaultConfig, '0.1.0')
      const result = validator.validate({ ...VALID_MANIFEST, schemaVersion: '0.9' })
      expect(result.valid).toBe(false)
    })
  })

  describe('runtimeVersion', () => {
    it('passes when runtimeVersion range is satisfied by runtime version', () => {
      const validator = new ManifestValidator(defaultConfig, '0.1.0')
      const result = validator.validate({ ...VALID_MANIFEST, runtimeVersion: '^0.1' })
      expect(result.valid).toBe(true)
    })

    it('errors when runtimeVersion range is not satisfied', () => {
      const validator = new ManifestValidator(defaultConfig, '0.1.0')
      const result = validator.validate({ ...VALID_MANIFEST, runtimeVersion: '^1.0' })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('runtimeVersion'))).toBe(true)
    })

    it('errors when runtimeVersion is not a valid semver range', () => {
      const validator = new ManifestValidator(defaultConfig, '0.1.0')
      const result = validator.validate({ ...VALID_MANIFEST, runtimeVersion: 'not-semver' })
      expect(result.valid).toBe(false)
    })
  })

  describe('compatibility', () => {
    it('emits a warning for experimental compatibility', () => {
      const validator = new ManifestValidator(defaultConfig, '0.1.0')
      const result = validator.validate({ ...VALID_MANIFEST, compatibility: 'experimental' })
      expect(result.valid).toBe(true)
      expect(result.warnings.some(w => w.includes('experimental'))).toBe(true)
    })

    it('errors for experimental when rejectExperimental is true', () => {
      const config: ManifestConfig = { rejectExperimental: true, scanPaths: [] }
      const validator = new ManifestValidator(config, '0.1.0')
      const result = validator.validate({ ...VALID_MANIFEST, compatibility: 'experimental' })
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('experimental'))).toBe(true)
    })

    it('emits a warning for deprecated compatibility', () => {
      const validator = new ManifestValidator(defaultConfig, '0.1.0')
      const result = validator.validate({ ...VALID_MANIFEST, compatibility: 'deprecated' })
      expect(result.valid).toBe(true)
      expect(result.warnings.some(w => w.includes('deprecated'))).toBe(true)
    })

    it('no warning for stable compatibility', () => {
      const validator = new ManifestValidator(defaultConfig, '0.1.0')
      const result = validator.validate({ ...VALID_MANIFEST, compatibility: 'stable' })
      expect(result.valid).toBe(true)
      expect(result.warnings).toHaveLength(0)
    })
  })

  describe('type', () => {
    it('warns for unactivated types', () => {
      const validator = new ManifestValidator(defaultConfig, '0.1.0')
      const types = ['memory', 'policy', 'telemetry', 'scheduler', 'ui'] as const
      for (const type of types) {
        const result = validator.validate({ ...VALID_MANIFEST, type })
        expect(result.warnings.some(w => w.includes(type))).toBe(true)
      }
    })

    it('no warning for activated types', () => {
      const validator = new ManifestValidator(defaultConfig, '0.1.0')
      for (const type of ['capability', 'provider'] as const) {
        const result = validator.validate({ ...VALID_MANIFEST, type })
        expect(result.warnings.some(w => w.includes('not activated'))).toBe(false)
      }
    })
  })

  describe('requiresFeatures', () => {
    it('warns for unknown features', () => {
      const validator = new ManifestValidator(defaultConfig, '0.1.0')
      const result = validator.validate({ ...VALID_MANIFEST, requiresFeatures: ['unknown-feature-xyz'] })
      expect(result.valid).toBe(true)
      expect(result.warnings.some(w => w.includes('unknown-feature-xyz'))).toBe(true)
    })
  })
})
