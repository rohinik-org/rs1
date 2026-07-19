import type { SdkCapability, SdkProvider, SdkSkill } from '@rohinik-org/foundation'
import type { MutableCapabilityCatalog } from '../interfaces/catalog.js'
import type { MutableExecutionResolver } from '../interfaces/resolver.js'
import type { Capability } from '../interfaces/capability.js'
import type { Skill } from '../interfaces/skill.js'
import type { Provider } from '../interfaces/provider.js'
import type { TierId } from '../interfaces/tier.js'
import { ZERO_COST } from '../domain/cost.js'
import { DEFAULT_DIAGNOSTIC_SINK, type DiagnosticSink } from '../services/diagnostic-sink.js'

// SdkSkill is intentionally minimal (metadata-only) so extension authors avoid a compile-time
// dependency on kernel execution contracts — but capability-core skills implement the full
// Skill shape, so duck-type check to wire them through rather than stub them out.
function adaptSkill(sdkSkill: SdkSkill, capabilityId: string): Skill {
  const realSkill = sdkSkill as unknown as Skill
  const realMeta = realSkill.metadata as Skill['metadata']

  // Full Skill: has execute() plus EITHER matching.matcher OR evaluate().
  // Both paths get wired through with their real metadata (including tierId).
  const hasExecute = typeof realSkill.execute === 'function'
  const hasEvaluate = typeof realSkill.evaluate === 'function'
  const hasMatcher = realMeta.matching?.matcher !== undefined

  if (hasExecute && (hasEvaluate || hasMatcher)) {
    const metadata: Skill['metadata'] = {
      skillId: sdkSkill.metadata.skillId,
      name: sdkSkill.metadata.name,
      tierId: realMeta.tierId ?? 'DETERMINISTIC',
      version: sdkSkill.metadata.version,
      executionModel: realMeta.executionModel ?? 'DETERMINISTIC',
      requirements: realMeta.requirements ?? {},
      ...(realMeta.matching !== undefined ? { matching: realMeta.matching } : {}),
    }
    const adapted: Skill = {
      metadata,
      estimatedCost: (ctx) => realSkill.estimatedCost(ctx),
      execute: (ctx, providers) => realSkill.execute(ctx, providers),
      ...(hasEvaluate ? { evaluate: (ctx) => realSkill.evaluate!(ctx) } : {}),
    }
    return adapted
  }

  // Fallback stub for minimal SdkSkill implementations that only carry metadata.
  const metadata = {
    skillId: sdkSkill.metadata.skillId,
    name: sdkSkill.metadata.name,
    tierId: 'DETERMINISTIC' as const,
    version: sdkSkill.metadata.version,
    executionModel: 'DETERMINISTIC' as const,
    requirements: {},
  }
  return {
    metadata,
    estimatedCost: (_ctx) => ZERO_COST,
    evaluate: (_ctx) => ({ matched: false as const }),
    execute: async (_ctx, _providers) => ({
      status: 'FAILURE' as const,
      result: undefined,
      skillId: sdkSkill.metadata.skillId,
      stepId: `${capabilityId}:${sdkSkill.metadata.skillId}`,
      diagnostics: [],
      metrics: {
        durationMs: 0,
        resourceCost: ZERO_COST,
        cacheHit: false,
      },
      cacheable: false,
      retryable: false,
    }),
  }
}

function adaptCapability(sdkCap: SdkCapability, diagnostics: DiagnosticSink): Capability {
  const skills = sdkCap.skills.map(s => adaptSkill(s, sdkCap.metadata.capabilityId))
  const declaredTier = sdkCap.metadata.execution?.tierId

  let tierId: TierId
  if (declaredTier !== undefined) {
    tierId = declaredTier
  } else {
    // Backward compatibility: derive from first skill; emit deprecation.
    // If the capability has no skills either, default to DETERMINISTIC as
    // the least-surprising placeholder — this matches Stage 4A behavior for
    // empty test/demo capabilities.
    const firstSkillTier = skills[0]?.metadata.tierId
    tierId = firstSkillTier ?? 'DETERMINISTIC'
    diagnostics.emit({
      severity: 'DEPRECATION',
      code: 'CAPABILITY_TIER_UNDECLARED',
      message:
        `Capability '${sdkCap.metadata.capabilityId}' does not declare execution.tierId. ` +
        `Derived '${tierId}'${firstSkillTier === undefined ? ' (default; no skills)' : ' from first skill'}. ` +
        `Future releases will require explicit declaration.`,
      data: { capabilityId: sdkCap.metadata.capabilityId, derivedTierId: tierId },
    })
  }

  // Invariant: every skill inside a capability must agree with the
  // capability's declared tier. Mixed routing tiers inside one capability
  // are not permitted — split into separate capabilities.
  for (const skill of skills) {
    if (skill.metadata.tierId !== tierId) {
      throw new Error(
        `Capability '${sdkCap.metadata.capabilityId}' declares tier '${tierId}' ` +
        `but skill '${skill.metadata.skillId}' declares tier '${skill.metadata.tierId}'. ` +
        `Mixed routing tiers inside one capability are not permitted. Split into separate capabilities.`,
      )
    }
  }

  return {
    metadata: {
      capabilityId: sdkCap.metadata.capabilityId,
      name: sdkCap.metadata.name,
      tierId,
      version: sdkCap.metadata.version,
      contractVersion: sdkCap.metadata.contractVersion,
    },
    skills,
  }
}

function adaptProvider(sdkProv: SdkProvider): Provider {
  // Duck-type check: real providers (AnthropicProvider, OpenAIProvider) implement
  // the full Provider shape with environments and capabilities.
  const real = sdkProv as unknown as Provider
  // Return the real instance directly — prototype methods (reason, generate, etc.)
  // must survive to reach skills. Patch only the metadata fields that need
  // SDK→kernel normalization, directly on the instance so the prototype chain
  // is untouched.
  const normalizedMetadata = {
    providerId: sdkProv.metadata.providerId,
    name: sdkProv.metadata.name,
    environments: real.metadata.environments ?? [],
    capabilities: real.metadata.capabilities ?? [],
    version: sdkProv.metadata.version,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(real as any).metadata = normalizedMetadata
  if (typeof real.health !== 'function') {
    real.health = async () => ({ status: 'HEALTHY' as const })
  }
  return real
}

export class RuntimeRegistry {
  constructor(
    private readonly catalog: MutableCapabilityCatalog,
    private readonly resolver: MutableExecutionResolver,
    private readonly diagnostics: DiagnosticSink = DEFAULT_DIAGNOSTIC_SINK,
  ) {}

  registerCapability(cap: SdkCapability): void {
    this.catalog.register(adaptCapability(cap, this.diagnostics))
  }

  registerProvider(prov: SdkProvider): void {
    this.resolver.registerProvider(adaptProvider(prov))
  }

  listRegisteredSkills(): Array<{ skillId: string; name: string; tierId: string; version: string }> {
    return this.catalog.getAllSkills().map(skill => ({
      skillId: skill.metadata.skillId,
      name: skill.metadata.name,
      tierId: skill.metadata.tierId,
      version: skill.metadata.version,
    }))
  }
}
