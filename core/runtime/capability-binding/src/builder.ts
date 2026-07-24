import { createHash, randomUUID } from 'node:crypto'
import { canonicalStringify } from '@rohinik-org/capability-contracts'
import type {
  IdGenerator,
  Clock,
  IsoTimestamp,
  JsonValue,
} from '@rohinik-org/capability-contracts-ir'
import type {
  CapabilityBindingBuilder,
  CapabilityBindingBuildContext,
  CapabilityBindingDraft,
  CapabilityBindingBuildResult,
  CapabilityBindingSupersessionResult,
  CapabilityBinding,
  CapabilityBindingHashProjection,
  CapabilityBindingHash,
  CapabilityBindingId,
  CapabilityBindingValidationError,
  CapabilityBindingValidationWarning,
  CapabilityBindingValidationResult,
  CapabilityBindingReadiness,
  CapabilityBindingErrorCode,
  BoundProviderReference,
  ResolvedProviderReference,
} from '@rohinik-org/capability-binding-ir'

// --- Production defaults ---

export function createProductionIdGenerator(): IdGenerator {
  return { generate: () => randomUUID() }
}

export function createProductionClock(): Clock {
  return { now: () => new Date().toISOString() as IsoTimestamp }
}

// --- Deep freeze ---

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  Object.freeze(obj)
  for (const key of Object.keys(obj as object)) {
    const val = (obj as Record<string, unknown>)[key]
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val)
    }
  }
  return obj
}

// --- Hash computation ---

function sha256hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex')
}

function computeBindingHash(projection: CapabilityBindingHashProjection): CapabilityBindingHash {
  return sha256hex(canonicalStringify(projection as unknown as JsonValue)) as CapabilityBindingHash
}

// --- Validation error helper ---

function err(
  code: CapabilityBindingErrorCode,
  path: string,
  message: string,
  relatedPaths?: readonly string[],
): CapabilityBindingValidationError {
  return relatedPaths ? { code, path, message, relatedPaths } : { code, path, message }
}

// --- Builder ---

export function createCapabilityBindingBuilder(deps: {
  idGenerator: IdGenerator
  clock: Clock
}): CapabilityBindingBuilder {
  const { idGenerator, clock } = deps

  function build(
    draft: CapabilityBindingDraft,
    context: CapabilityBindingBuildContext,
  ): CapabilityBindingBuildResult {
    const errors: CapabilityBindingValidationError[] = []
    const warnings: CapabilityBindingValidationWarning[] = []
    const { requirementSet, resolutionArtifact, lockArtifact, trustArtifact } = context

    // §16 — validate requirement set identity
    if (requirementSet.setId !== draft.setId) {
      errors.push(err('REQUIREMENT_SET_NOT_FOUND', 'draft.setId',
        `setId '${draft.setId}' not found in requirementSet (got '${requirementSet.setId}')`))
    }
    if (requirementSet.semanticHash !== draft.semanticHash) {
      errors.push(err('SEMANTIC_HASH_MISMATCH', 'draft.semanticHash',
        `semanticHash mismatch: draft='${draft.semanticHash}' set='${requirementSet.semanticHash}'`))
    }

    // Find the requirement
    const req = requirementSet.requirements.find(r => r.requirementId === draft.requirementId)
    if (!req) {
      errors.push(err('REQUIREMENT_NOT_FOUND', 'draft.requirementId',
        `requirementId '${draft.requirementId}' not found in requirementSet`))
    } else {
      if (req.requirementHash !== draft.requirementHash) {
        errors.push(err('REQUIREMENT_HASH_MISMATCH', 'draft.requirementHash',
          `requirementHash mismatch: draft='${draft.requirementHash}' requirement='${req.requirementHash}'`))
      }
      if (req.capabilityId !== draft.capabilityId) {
        errors.push(err('CAPABILITY_ID_MISMATCH', 'draft.capabilityId',
          `capabilityId mismatch: draft='${draft.capabilityId}' requirement='${req.capabilityId}'`))
      }
      if (req.multiplicity !== draft.multiplicity) {
        errors.push(err('MULTIPLICITY_MISMATCH', 'draft.multiplicity',
          `multiplicity mismatch: draft='${draft.multiplicity}' requirement='${req.multiplicity}'`))
      }
    }

    // Validate resolution artifact
    if (resolutionArtifact.resolutionId !== draft.resolutionId) {
      errors.push(err('RESOLUTION_ID_MISMATCH', 'draft.resolutionId',
        `resolutionId mismatch: draft='${draft.resolutionId}' artifact='${resolutionArtifact.resolutionId}'`))
    }

    // Validate providers
    const seenProviderIds = new Set<string>()
    for (let i = 0; i < draft.providers.length; i++) {
      const p = draft.providers[i]!
      if (seenProviderIds.has(p.providerId)) {
        errors.push(err('DUPLICATE_PROVIDER_ID', `draft.providers[${i}].providerId`,
          `Duplicate providerId '${p.providerId}'`))
      }
      seenProviderIds.add(p.providerId)

      // Check provider exists in resolution artifact at correct position
      const artifactIdx = resolutionArtifact.selectedProviders.findIndex(
        sp => sp.providerId === p.providerId,
      )
      if (artifactIdx === -1) {
        errors.push(err('PROVIDER_NOT_IN_RESOLUTION', `draft.providers[${i}].providerId`,
          `Provider '${p.providerId}' not in resolution artifact`))
      } else if (artifactIdx !== i) {
        errors.push(err('PROVIDER_ORDER_MISMATCH', `draft.providers[${i}].providerId`,
          `Provider '${p.providerId}' is at index ${artifactIdx} in resolution artifact but ${i} in draft`))
      } else {
        // Provider order matches — validate capabilityId and packageContentHash
        const sp = resolutionArtifact.selectedProviders[artifactIdx]!
        if (sp.capabilityVersion !== undefined && p.capabilityId !== draft.capabilityId) {
          // capabilityId on provider reference should match requirement
        }
        if (sp.packageContentHash !== p.package.packageContentHash) {
          errors.push(err('PACKAGE_CONTENT_HASH_MISMATCH', `draft.providers[${i}].package.packageContentHash`,
            `packageContentHash mismatch for provider '${p.providerId}': draft='${p.package.packageContentHash}' artifact='${sp.packageContentHash}'`))
        }
      }

      // Validate capabilityId on provider (must match requirement)
      if (req && p.capabilityId !== req.capabilityId) {
        errors.push(err('CAPABILITY_ID_MISMATCH', `draft.providers[${i}].capabilityId`,
          `Provider capabilityId '${p.capabilityId}' does not match requirement capabilityId '${req.capabilityId}'`))
      }
    }

    // Validate multiplicity count (only if no order/membership errors already for providers)
    const mult = draft.multiplicity
    const n = draft.providers.length
    if (mult === 'single') {
      if (n !== 1) {
        errors.push(err('SINGLE_REQUIRES_EXACTLY_ONE_PROVIDER', 'draft.providers',
          `multiplicity 'single' requires exactly 1 provider, got ${n}`))
      }
    } else if (mult === 'one-or-more') {
      if (n < 1) {
        errors.push(err('ONE_OR_MORE_REQUIRES_PROVIDER', 'draft.providers',
          `multiplicity 'one-or-more' requires at least 1 provider, got ${n}`))
      }
    } else if (mult === 'all-compatible') {
      if (n !== resolutionArtifact.selectedProviders.length) {
        errors.push(err('ALL_COMPATIBLE_PROVIDER_SET_MISMATCH', 'draft.providers',
          `multiplicity 'all-compatible' requires exactly ${resolutionArtifact.selectedProviders.length} providers (full resolution set), got ${n}`))
      }
    }

    // Validate lock entries
    if (lockArtifact) {
      for (let i = 0; i < draft.providers.length; i++) {
        const p = draft.providers[i]!
        if (p.lockEntryHash !== undefined) {
          // Verify lockEntryHash matches the entry in lockArtifact for this provider
          const lockEntry = lockArtifact.entries.find(e => e.providerId === p.providerId)
          if (!lockEntry || lockEntry.lockEntryHash !== p.lockEntryHash) {
            errors.push(err('LOCK_ENTRY_MISMATCH', `draft.providers[${i}].lockEntryHash`,
              `Lock entry hash mismatch for provider '${p.providerId}'`))
          } else if (lockEntry.packageContentHash !== p.package.packageContentHash) {
            errors.push(err('LOCK_ENTRY_MISMATCH', `draft.providers[${i}].lockEntryHash`,
              `Lock entry packageContentHash mismatch for provider '${p.providerId}'`))
          }
        }
      }
    }

    // Validate trust decisions
    if (trustArtifact) {
      for (let i = 0; i < draft.providers.length; i++) {
        const p = draft.providers[i]!
        if (p.trustDecisionHash !== undefined) {
          const decision = trustArtifact.decisions.find(d => d.providerId === p.providerId)
          if (!decision || decision.trustDecisionHash !== p.trustDecisionHash) {
            errors.push(err('TRUST_DECISION_MISMATCH', `draft.providers[${i}].trustDecisionHash`,
              `Trust decision hash mismatch for provider '${p.providerId}'`))
          } else if (
            decision.providerDescriptorHash !== p.providerDescriptorHash ||
            decision.packageContentHash !== p.package.packageContentHash
          ) {
            errors.push(err('TRUST_DECISION_MISMATCH', `draft.providers[${i}].trustDecisionHash`,
              `Trust decision providerDescriptorHash or packageContentHash mismatch for provider '${p.providerId}'`))
          }
        }
      }
    }

    if (errors.length > 0) {
      return { status: 'invalid', validation: { valid: false, errors, warnings } }
    }

    // --- Warnings ---
    const allInstalled = draft.providers.every(p => p.package.installationId !== undefined)
    if (!allInstalled) {
      for (let i = 0; i < draft.providers.length; i++) {
        const p = draft.providers[i]!
        if (p.package.installationId === undefined) {
          warnings.push({ code: 'PROVIDER_NOT_YET_INSTALLED', path: `draft.providers[${i}].package.installationId`,
            message: `Provider '${p.providerId}' not yet installed` })
        }
      }
    }
    if (!lockArtifact) {
      warnings.push({ code: 'LOCK_ARTIFACT_NOT_YET_AVAILABLE', path: 'context.lockArtifact',
        message: 'Lock artifact not yet available' })
    }
    if (!trustArtifact) {
      warnings.push({ code: 'TRUST_ARTIFACT_NOT_YET_AVAILABLE', path: 'context.trustArtifact',
        message: 'Trust artifact not yet available' })
    }

    // --- Readiness ---
    const readiness = computeReadiness(draft, lockArtifact, trustArtifact)

    // --- Build bound providers ---
    const boundProviders: BoundProviderReference[] = draft.providers.map(p => {
      const bp: BoundProviderReference = {
        providerId:             p.providerId,
        providerVersion:        p.providerVersion,
        capabilityVersion:      p.capabilityVersion,
        packageId:              p.package.packageId,
        packageVersion:         p.package.packageVersion,
        packageContentHash:     p.package.packageContentHash,
        providerDescriptorHash: p.providerDescriptorHash,
        resolutionEntryHash:    p.resolutionEntryHash,
        ...(p.package.installationId !== undefined && { installationId: p.package.installationId }),
        ...(p.lockEntryHash !== undefined && { lockEntryHash: p.lockEntryHash }),
        ...(p.trustDecisionHash !== undefined && { trustDecisionHash: p.trustDecisionHash }),
      }
      return bp
    })

    // --- Hash projection ---
    const state = readiness.state
    const supersedesBindingId = draft.bindingId !== undefined
      ? undefined // new build — no supersedes
      : undefined

    // Note: supersedesBindingId comes from the draft if provided externally (supersede flow sets it)
    const supersedesId = (draft as CapabilityBindingDraft & { supersedesBindingId?: CapabilityBindingId }).supersedesBindingId

    const projection: CapabilityBindingHashProjection = {
      schemaVersion:  '1.0',
      setId:          draft.setId,
      semanticHash:   draft.semanticHash,
      requirementId:  draft.requirementId,
      requirementHash: draft.requirementHash,
      capabilityId:   draft.capabilityId,
      multiplicity:   draft.multiplicity,
      providers:      boundProviders.map(bp => ({
        providerId:             bp.providerId,
        providerVersion:        bp.providerVersion,
        capabilityVersion:      bp.capabilityVersion,
        packageId:              bp.packageId,
        packageVersion:         bp.packageVersion,
        packageContentHash:     bp.packageContentHash,
        providerDescriptorHash: bp.providerDescriptorHash,
        resolutionEntryHash:    bp.resolutionEntryHash,
        ...(bp.installationId !== undefined && { installationId: bp.installationId }),
        ...(bp.lockEntryHash !== undefined && { lockEntryHash: bp.lockEntryHash }),
        ...(bp.trustDecisionHash !== undefined && { trustDecisionHash: bp.trustDecisionHash }),
      })),
      resolutionId:   draft.resolutionId,
      state,
      ...(supersedesId !== undefined && { supersedesBindingId: supersedesId }),
    }

    const bindingHash = computeBindingHash(projection)
    const bindingId = (draft.bindingId !== undefined
      ? draft.bindingId
      : idGenerator.generate()) as CapabilityBindingId
    const createdAt = clock.now()

    const binding: CapabilityBinding = {
      bindingId,
      bindingHash,
      schemaVersion:  '1.0',
      setId:          draft.setId,
      semanticHash:   draft.semanticHash,
      requirementId:  draft.requirementId,
      requirementHash: draft.requirementHash,
      capabilityId:   draft.capabilityId,
      multiplicity:   draft.multiplicity,
      providers:      boundProviders,
      resolutionId:   draft.resolutionId,
      state,
      createdAt,
      ...(supersedesId !== undefined && { supersedesBindingId: supersedesId }),
    }

    return {
      status: 'created',
      binding: deepFreeze(binding),
      validation: { valid: true, errors: [], warnings },
    }
  }

  function supersede(
    existing: CapabilityBinding,
    replacementDraft: CapabilityBindingDraft,
    context: CapabilityBindingBuildContext,
  ): CapabilityBindingSupersessionResult {
    if (existing.state === 'superseded') {
      throw new Error('BINDING_ALREADY_SUPERSEDED: Cannot supersede a binding that is already superseded')
    }

    // Inject supersedesBindingId into the draft
    const draftWithSupersedes = {
      ...replacementDraft,
      supersedesBindingId: existing.bindingId,
    }

    const result = build(draftWithSupersedes as CapabilityBindingDraft, context)
    if (result.status === 'invalid') {
      throw new Error(
        'Supersession replacement draft is invalid: ' +
        result.validation.errors.map(e => e.message).join('; '),
      )
    }

    const previous: CapabilityBinding = deepFreeze({ ...existing, state: 'superseded' as const })
    return { previous, replacement: result.binding }
  }

  return { build, supersede }
}

// --- Readiness computation ---

interface ReadinessResult {
  state: Exclude<import('@rohinik-org/capability-binding-ir').CapabilityBindingState, 'active'>
  readiness: CapabilityBindingReadiness
}

function computeReadiness(
  draft: CapabilityBindingDraft,
  lockArtifact: import('@rohinik-org/capability-binding-ir').CapabilityLockArtifactProjection | undefined,
  trustArtifact: import('@rohinik-org/capability-binding-ir').CapabilityTrustArtifactProjection | undefined,
): ReadinessResult {
  const allInstalled = draft.providers.every(p => p.package.installationId !== undefined)

  if (!allInstalled) {
    return {
      state: 'planned',
      readiness: { ready: false, missing: ['provider-installation'] },
    }
  }

  const missing: import('@rohinik-org/capability-binding-ir').CapabilityBindingPrerequisite[] = []

  // Check lock entries present for all providers (when lock artifact provided)
  if (lockArtifact) {
    const allLocked = draft.providers.every(p => p.lockEntryHash !== undefined)
    if (!allLocked) missing.push('lock-entry')
  }

  // Check trust decisions present for all providers (when trust artifact provided)
  if (trustArtifact) {
    const allTrusted = draft.providers.every(p => p.trustDecisionHash !== undefined)
    if (!allTrusted) missing.push('trust-decision')
  }

  if (missing.length > 0) {
    return { state: 'installed', readiness: { ready: false, missing } }
  }

  // All installed + lock/trust satisfied
  return {
    state: 'ready-for-activation',
    readiness: { ready: true, missing: [] },
  }
}
