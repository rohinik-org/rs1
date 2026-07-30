import type { ProvidedCapabilityDeclaration } from '@rohinik-org/package-manifest-ir'
import type { PackageDefinition } from './define-package.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CapabilityBinding<TInput, TOutput> {
  readonly capabilityId: string
  readonly version: string
  readonly _inputType: TInput
  readonly _outputType: TOutput
}

export interface ProviderDefinition {
  readonly packageId: string
  readonly capabilities: readonly CapabilityBinding<unknown, unknown>[]
}

export interface DefineProviderInput {
  readonly packageDefinition: PackageDefinition
  readonly capabilities: readonly CapabilityBinding<unknown, unknown>[]
}

// ─── defineProvider ───────────────────────────────────────────────────────────

export function defineProvider(input: DefineProviderInput): ProviderDefinition {
  const provided = input.packageDefinition.provides
  const seenIds = new Set<string>()

  for (const binding of input.capabilities) {
    if (seenIds.has(binding.capabilityId)) {
      throw Object.assign(
        new Error(`validation-failed: duplicate capability id "${binding.capabilityId}" in provider definition`),
        { code: 'validation-failed' as const },
      )
    }
    seenIds.add(binding.capabilityId)

    const declared = provided.find((p: ProvidedCapabilityDeclaration) => p.capability === binding.capabilityId)
    if (!declared) {
      throw Object.assign(
        new Error(`conformance-failed: capability "${binding.capabilityId}" not declared in package provides`),
        { code: 'conformance-failed' as const },
      )
    }
  }

  return Object.freeze({
    packageId: input.packageDefinition.package.id,
    capabilities: Object.freeze([...input.capabilities]),
  })
}

