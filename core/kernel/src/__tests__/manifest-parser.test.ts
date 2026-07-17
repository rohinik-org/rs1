import { describe, it, expect } from 'vitest'
import { ManifestParser } from '../manifest/parser.js'
import type { ParseSuccess } from '../manifest/parser.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const VALID_MANIFEST = {
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

describe('ManifestParser', () => {
  const parser = new ManifestParser()

  describe('parse()', () => {
    it('returns ok: true for a valid manifest', () => {
      const result = parser.parse(VALID_MANIFEST)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.manifest.id).toBe('test-ext')
        expect(result.manifest.type).toBe('capability')
      }
    })

    it('includes all optional fields when present', () => {
      const raw = {
        ...VALID_MANIFEST,
        requiresProviders: ['reasoning-engine'],
        requiresCapabilities: [{ id: 'other-ext', contractVersion: '1.0' }],
        requiresFeatures: ['feature-flag-x'],
        skills: ['skill-a', 'skill-b'],
        permissions: ['filesystem:read'],
      }
      const result = parser.parse(raw)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.manifest.requiresProviders).toEqual(['reasoning-engine'])
        expect(result.manifest.requiresCapabilities).toHaveLength(1)
        expect(result.manifest.skills).toEqual(['skill-a', 'skill-b'])
      }
    })

    it('returns ok: false when required field is missing', () => {
      const { id: _id, ...noId } = VALID_MANIFEST
      const result = parser.parse(noId)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThan(0)
        expect(result.errors.some(e => e.includes('id'))).toBe(true)
      }
    })

    it('returns ok: false for wrong type on a field', () => {
      const result = parser.parse({ ...VALID_MANIFEST, version: 42 })
      expect(result.ok).toBe(false)
    })

    it('returns ok: false for an invalid type field', () => {
      const result = parser.parse({ ...VALID_MANIFEST, type: 'invalid-type' })
      expect(result.ok).toBe(false)
    })

    it('accepts all valid ManifestType values', () => {
      const types = ['capability', 'provider', 'memory', 'policy', 'telemetry', 'scheduler', 'ui']
      for (const type of types) {
        const result = parser.parse({ ...VALID_MANIFEST, type })
        expect(result.ok).toBe(true)
      }
    })

    it('accepts all valid compatibility values', () => {
      const values = ['stable', 'experimental', 'deprecated']
      for (const compatibility of values) {
        const result = parser.parse({ ...VALID_MANIFEST, compatibility })
        expect(result.ok).toBe(true)
      }
    })

    it('attaches source to error result when provided', () => {
      const result = parser.parse({}, '/some/path/rohinik.manifest.json')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.source).toBe('/some/path/rohinik.manifest.json')
      }
    })

    it('returns ok: false for non-object input', () => {
      expect(parser.parse(null).ok).toBe(false)
      expect(parser.parse('string').ok).toBe(false)
      expect(parser.parse(42).ok).toBe(false)
    })
  })

  describe('parseFile()', () => {
    it('parses a valid manifest JSON file', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-test-'))
      const filePath = path.join(dir, 'rohinik.manifest.json')
      fs.writeFileSync(filePath, JSON.stringify(VALID_MANIFEST))

      const result = await parser.parseFile(filePath)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.manifest.id).toBe('test-ext')
      }

      fs.rmSync(dir, { recursive: true })
    })

    it('returns ok: false for non-existent file', async () => {
      const result = await parser.parseFile('/does/not/exist/rohinik.manifest.json')
      expect(result.ok).toBe(false)
    })

    it('returns ok: false for invalid JSON', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-test-'))
      const filePath = path.join(dir, 'rohinik.manifest.json')
      fs.writeFileSync(filePath, 'not-json{{{')

      const result = await parser.parseFile(filePath)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.source).toBe(filePath)
      }

      fs.rmSync(dir, { recursive: true })
    })
  })
})
