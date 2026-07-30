import { CAPABILITY_ID_PATTERN } from '@rohinik-org/package-manifest-ir'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConsumptionDescriptor<TInput, TOutput> {
  readonly capabilityId: string
  readonly versionRange: string
  readonly optional: boolean
  readonly _inputType: TInput
  readonly _outputType: TOutput
}

// ─── consumeCapability ────────────────────────────────────────────────────────

export function consumeCapability<TInput, TOutput>(
  capabilityId: string,
  versionRange: string,
  optional = false,
): ConsumptionDescriptor<TInput, TOutput> {
  if (!CAPABILITY_ID_PATTERN.test(capabilityId)) {
    throw Object.assign(
      new Error(`invalid-input: capability id "${capabilityId}" does not match required pattern`),
      { code: 'invalid-input' as const },
    )
  }
  if (!versionRange) {
    throw Object.assign(new Error('invalid-input: version range is required'), { code: 'invalid-input' as const })
  }

  return Object.freeze({
    capabilityId,
    versionRange,
    optional,
    _inputType: undefined as unknown as TInput,
    _outputType: undefined as unknown as TOutput,
  })
}
