import { describe, it, expect } from 'vitest'
import type {
  AuthorizedSecretRequirement,
} from '@rohinik-org/provisioning-ir'
import { SecretReader } from '../secret-reader.js'

describe('SecretReader', () => {
  describe('has()', () => {
    it('returns true for present non-empty secret', async () => {
      const reader = new SecretReader(new Map([['API_KEY', 'secret-value']]))
      expect(await reader.has('API_KEY')).toBe(true)
    })

    it('returns false for absent secret', async () => {
      const reader = new SecretReader(new Map())
      expect(await reader.has('MISSING_KEY')).toBe(false)
    })

    it('returns false for present but empty string secret', async () => {
      const reader = new SecretReader(new Map([['EMPTY_KEY', '']]))
      expect(await reader.has('EMPTY_KEY')).toBe(false)
    })
  })

  describe('checkReadiness()', () => {
    function req(secretName: string, required: boolean): AuthorizedSecretRequirement {
      return { requirementId: `req-${secretName}`, providerId: 'test-provider', secretName, required }
    }

    it('returns allPresent:true when all required secrets present', async () => {
      const reader = new SecretReader(new Map([['KEY_A', 'val-a'], ['KEY_B', 'val-b']]))
      const result = await reader.checkReadiness([req('KEY_A', true), req('KEY_B', true)])
      expect(result.allPresent).toBe(true)
      expect(result.missingSecretNames).toHaveLength(0)
    })

    it('returns allPresent:false with missing name when required secret absent', async () => {
      const reader = new SecretReader(new Map([['KEY_A', 'val-a']]))
      const result = await reader.checkReadiness([req('KEY_A', true), req('MISSING_KEY', true)])
      expect(result.allPresent).toBe(false)
      expect(result.missingSecretNames).toContain('MISSING_KEY')
    })

    it('optional absent secret does not affect allPresent', async () => {
      const reader = new SecretReader(new Map([['KEY_A', 'val-a']]))
      const result = await reader.checkReadiness([req('KEY_A', true), req('OPTIONAL_KEY', false)])
      expect(result.allPresent).toBe(true)
      expect(result.missingSecretNames).toHaveLength(0)
    })

    it('result contains no secret values (non-exposure guarantee)', async () => {
      const secretValue = 'super-secret-do-not-expose-12345'
      const reader = new SecretReader(new Map([['MY_SECRET', secretValue]]))
      const result = await reader.checkReadiness([req('MY_SECRET', true)])
      const serialized = JSON.stringify(result)
      expect(serialized).not.toContain(secretValue)
    })
  })
})
