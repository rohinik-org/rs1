import { CAPABILITY_ID_PATTERN } from '@rohinik-org/package-manifest-ir'
import type { CapabilityBinding } from './define-provider.js'

// ─── provideCapability ────────────────────────────────────────────────────────

export function provideCapability<TInput, TOutput>(capabilityId: string, version: string): CapabilityBinding<TInput, TOutput> {
  if (!CAPABILITY_ID_PATTERN.test(capabilityId)) {
    throw Object.assign(
      new Error(`invalid-input: capability id "${capabilityId}" does not match required pattern`),
      { code: 'invalid-input' as const },
    )
  }
  if (!version) {
    throw Object.assign(new Error('invalid-input: capability version is required'), { code: 'invalid-input' as const })
  }

  return Object.freeze({
    capabilityId,
    version,
    _inputType: undefined as unknown as TInput,
    _outputType: undefined as unknown as TOutput,
  })
}
