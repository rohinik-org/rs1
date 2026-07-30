import { createHash, randomUUID } from 'node:crypto'
import { canonicalStringify } from '@rohinik-org/capability-contracts'
import { deepFreeze } from './deep-freeze.js'
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
  CapabilityBindingPreparationResult,
  CapabilityBindingSupersessionResult,
  CapabilityBinding,
  CapabilityBindingRecord,
  CapabilityBindingHashProjection,
  CapabilityBindingHash,
  CapabilityBindingId,
  CapabilityBindingValidationError,
  CapabilityBindingValidationWarning,
  CapabilityBindingValidationResult,
  CapabilityBindingReadiness,
  CapabilityProviderReadiness,
  CapabilityBindingErrorCode,
  CapabilityBindingPrerequisite,
  CapabilityBindingState,
  BoundProviderReference,
  PreparedCapabilityBinding,
  CapabilityLockEntryHash,
  ContentHash,
} from '@rohinik-org/capability-binding-ir'

// --- Production defaults ---

export function createProductionIdGenerator(): IdGenerator {
  return { generate: () => randomUUID() }
}

export function createProductionClock(): Clock {
  return { now: () => new Date().toISOString() as IsoTimestamp }
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

// --- Opaque prepared token ---

// Module-private brand symbol — token is truly opaque
const PreparedBrand = Symbol('PreparedCapabilityBinding')

interface PreparedTokenInternal {
  readonly [PreparedBrand]: 'PreparedCapabilityBinding'
  readonly boundProviders:    readonly BoundProviderReference[]
  readonly hashProjection:    CapabilityBindingHashProjection
  readonly bindingHash:       CapabilityBindingHash
  readonly readiness:         CapabilityBindingReadiness
  readonly state:             Exclude<CapabilityBindingState, 'active' | 'invalidated' | 'superseded'>
  readonly draft:             CapabilityBindingDraft
  readonly warnings:          readonly CapabilityBindingValidationWarning[]
}

// --- Builder ---

export function createCapabilityBindingBuilder(deps: {
  idGenerator: IdGenerator
  clock: Clock
}): CapabilityBindingBuilder {
  const { idGenerator, clock } = deps

  function prepare(
    draft: CapabilityBindingDraft,
    context: CapabilityBindingBuildContext,
  ): CapabilityBindingPreparationResult {
    const errors: CapabilityBindingValidationError[] = []
    const warnings: CapabilityBindingValidationWarning[] = []
    const { requirementSet, resolutionArtifact, installationArtifact, lockArtifact, trustArtifact } = context

    // Rule 1: setId identity
    if (requirementSet.setId !== draft.setId) {
      errors.push(err('REQUIREMENT_SET_ID_MISMATCH', 'draft.setId',
        `setId '${draft.setId}' does not match requirementSet.setId '${requirementSet.setId}'`))
    }

    // Rule 2: semanticHash
    if (requirementSet.semanticHash !== draft.semanticHash) {
      errors.push(err('SEMANTIC_HASH_MISMATCH', 'draft.semanticHash',
        `semanticHash mismatch: draft='${draft.semanticHash}' set='${requirementSet.semanticHash}'`))
    }

    // Rules 3-6: requirement lookup
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

    // Rule 7: resolutionId
    if (resolutionArtifact.resolutionId !== draft.resolutionId) {
      errors.push(err('RESOLUTION_ID_MISMATCH', 'draft.resolutionId',
        `resolutionId mismatch: draft='${draft.resolutionId}' artifact='${resolutionArtifact.resolutionId}'`))
    }

    // Rule 16: duplicate provider IDs (check before order/membership)
    const seenProviderIds = new Set<string>()
    for (let i = 0; i < draft.providers.length; i++) {
      const p = draft.providers[i]!
      if (seenProviderIds.has(p.providerId)) {
        errors.push(err('DUPLICATE_PROVIDER_ID', `draft.providers[${i}].providerId`,
          `Duplicate providerId '${p.providerId}'`))
      }
      seenProviderIds.add(p.providerId)
    }

    // Rules 8-9: provider membership and order
    for (let i = 0; i < draft.providers.length; i++) {
      const p = draft.providers[i]!
      const artifactIdx = resolutionArtifact.selectedProviders.findIndex(sp => sp.providerId === p.providerId)
      if (artifactIdx === -1) {
        errors.push(err('PROVIDER_NOT_IN_RESOLUTION', `draft.providers[${i}].providerId`,
          `Provider '${p.providerId}' not in resolution artifact`))
      } else if (artifactIdx !== i) {
        errors.push(err('PROVIDER_ORDER_MISMATCH', `draft.providers[${i}].providerId`,
          `Provider '${p.providerId}' at index ${artifactIdx} in resolution artifact but ${i} in draft`))
      } else {
        // Rule 11: package content hash
        const sp = resolutionArtifact.selectedProviders[artifactIdx]!
        if (sp.packageContentHash !== p.package.packageContentHash) {
          errors.push(err('PACKAGE_CONTENT_HASH_MISMATCH', `draft.providers[${i}].package.packageContentHash`,
            `packageContentHash mismatch for provider '${p.providerId}': draft='${p.package.packageContentHash}' artifact='${sp.packageContentHash}'`))
        }
      }
    }

    // Rule 10: multiplicity count
    const mult = draft.multiplicity
    const n = draft.providers.length
    if (mult === 'single' && n !== 1) {
      errors.push(err('SINGLE_REQUIRES_EXACTLY_ONE_PROVIDER', 'draft.providers',
        `multiplicity 'single' requires exactly 1 provider, got ${n}`))
    } else if (mult === 'one-or-more' && n < 1) {
      errors.push(err('ONE_OR_MORE_REQUIRES_PROVIDER', 'draft.providers',
        `multiplicity 'one-or-more' requires at least 1 provider, got ${n}`))
    } else if (mult === 'all-compatible' && n !== resolutionArtifact.selectedProviders.length) {
      errors.push(err('ALL_COMPATIBLE_PROVIDER_SET_MISMATCH', 'draft.providers',
        `multiplicity 'all-compatible' requires ${resolutionArtifact.selectedProviders.length} providers, got ${n}`))
    }

    // Rule 14: installation artifact verification
    if (installationArtifact) {
      for (let i = 0; i < draft.providers.length; i++) {
        const p = draft.providers[i]!
        const entry = installationArtifact.installations.find(e => e.providerId === p.providerId)
        if (entry) {
          // Rule 15: empty/whitespace installationId or installationPath
          if (entry.installationId.trim().length === 0) {
            errors.push(err('INSTALLATION_REFERENCE_INVALID', `installationArtifact.installations[].installationId`,
              `Empty or whitespace installationId for provider '${p.providerId}'`))
          }
          if (entry.installationPath.trim().length === 0) {
            errors.push(err('INSTALLATION_REFERENCE_INVALID', `installationArtifact.installations[].installationPath`,
              `Empty or whitespace installationPath for provider '${p.providerId}'`))
          }
          // Verify package identity matches
          if (
            entry.packageId !== p.package.packageId ||
            entry.packageVersion !== p.package.packageVersion ||
            entry.packageContentHash !== p.package.packageContentHash
          ) {
            errors.push(err('INSTALLATION_ENTRY_MISMATCH', `installationArtifact.installations[].providerId`,
              `Installation entry package identity mismatch for provider '${p.providerId}'`))
          }
        }
        // Missing entry: deferred readiness (not an error)
      }
    }

    // Rule 12: lock artifact verification
    if (lockArtifact) {
      for (let i = 0; i < draft.providers.length; i++) {
        const p = draft.providers[i]!
        const lockEntry = lockArtifact.entries.find(e => e.providerId === p.providerId)
        if (lockEntry) {
          // Verify lock entry package identity
          if (
            lockEntry.packageId !== p.package.packageId ||
            lockEntry.packageVersion !== p.package.packageVersion ||
            lockEntry.packageContentHash !== p.package.packageContentHash
          ) {
            errors.push(err('LOCK_ENTRY_MISMATCH', `context.lockArtifact.entries[${i}]`,
              `Lock entry package mismatch for provider '${p.providerId}'`))
          }
        }
      }
    }

    // Rule 13: trust artifact verification
    if (trustArtifact) {
      for (let i = 0; i < draft.providers.length; i++) {
        const p = draft.providers[i]!
        const decision = trustArtifact.decisions.find(d => d.providerId === p.providerId)
        if (decision) {
          // decision = 'denied' is always a hard failure
          if (decision.decision === 'denied') {
            errors.push(err('TRUST_DECISION_DENIED', `context.trustArtifact.decisions[${i}]`,
              `Trust decision is 'denied' for provider '${p.providerId}'`))
          } else {
            // Verify providerDescriptorHash and packageContentHash
            const sp = resolutionArtifact.selectedProviders.find(s => s.providerId === p.providerId)
            if (
              sp &&
              (decision.providerDescriptorHash !== sp.providerDescriptorHash ||
               decision.packageContentHash !== p.package.packageContentHash)
            ) {
              errors.push(err('TRUST_DECISION_MISMATCH', `context.trustArtifact.decisions[${i}]`,
                `Trust decision providerDescriptorHash or packageContentHash mismatch for provider '${p.providerId}'`))
            }
          }
        }
      }
    }

    if (errors.length > 0) {
      return { status: 'invalid', validation: { valid: false, errors, warnings } }
    }

    // --- Warnings for missing artifacts ---
    if (!installationArtifact) {
      for (let i = 0; i < draft.providers.length; i++) {
        const p = draft.providers[i]!
        warnings.push({ code: 'PROVIDER_NOT_YET_INSTALLED', path: `context.installationArtifact`,
          message: `Provider '${p.providerId}' not yet installed` })
      }
    } else {
      // Check per-provider installation presence
      for (let i = 0; i < draft.providers.length; i++) {
        const p = draft.providers[i]!
        const entry = installationArtifact.installations.find(e => e.providerId === p.providerId)
        if (!entry) {
          warnings.push({ code: 'PROVIDER_NOT_YET_INSTALLED', path: `context.installationArtifact.installations`,
            message: `Provider '${p.providerId}' entry missing from installationArtifact` })
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

    // --- Build bound providers (derive lock/trust hashes from authoritative projections) ---
    const boundProviders: BoundProviderReference[] = draft.providers.map(p => {
      const lockEntry = lockArtifact?.entries.find(e => e.providerId === p.providerId)
      const trustDecision = trustArtifact?.decisions.find(d => d.providerId === p.providerId)
      const bp: BoundProviderReference = {
        providerId:             p.providerId,
        providerVersion:        p.providerVersion,
        capabilityVersion:      p.capabilityVersion,
        packageId:              p.package.packageId,
        packageVersion:         p.package.packageVersion,
        packageContentHash:     p.package.packageContentHash,
        providerDescriptorHash: p.providerDescriptorHash,
        ...(lockEntry !== undefined && { lockEntryHash: lockEntry.lockEntryHash as CapabilityLockEntryHash }),
        ...(trustDecision !== undefined && trustDecision.decision === 'trusted' && {
          trustDecisionHash: trustDecision.trustDecisionHash as ContentHash,
        }),
      }
      return bp
    })

    // --- Per-provider readiness ---
    const perProviderReadiness = computePerProviderReadiness(
      draft, boundProviders, installationArtifact, lockArtifact, trustArtifact,
    )
    const aggregateReady = perProviderReadiness.every(r => r.ready)
    const readiness: CapabilityBindingReadiness = {
      ready:     aggregateReady,
      providers: perProviderReadiness,
    }

    // --- Derive initial state ---
    const initialState = deriveStateFromReadiness(readiness)

    // --- Hash projection (state excluded) ---
    const projection: CapabilityBindingHashProjection = {
      schemaVersion:        '1.0',
      setId:                draft.setId,
      semanticHash:         draft.semanticHash,
      requirementId:        draft.requirementId,
      requirementHash:      draft.requirementHash,
      capabilityId:         draft.capabilityId,
      multiplicity:         draft.multiplicity,
      providers:            boundProviders.map(bp => ({
        providerId:             bp.providerId,
        providerVersion:        bp.providerVersion,
        capabilityVersion:      bp.capabilityVersion,
        packageId:              bp.packageId,
        packageVersion:         bp.packageVersion,
        packageContentHash:     bp.packageContentHash,
        providerDescriptorHash: bp.providerDescriptorHash,
        ...(bp.lockEntryHash !== undefined && { lockEntryHash: bp.lockEntryHash }),
        ...(bp.trustDecisionHash !== undefined && { trustDecisionHash: bp.trustDecisionHash }),
      })),
      resolutionId:         draft.resolutionId,
      resolutionEntryHash:  resolutionArtifact.resolutionEntryHash,
    }

    const bindingHash = computeBindingHash(projection)

    const token: PreparedTokenInternal = {
      [PreparedBrand]:     'PreparedCapabilityBinding',
      boundProviders,
      hashProjection:     projection,
      bindingHash,
      readiness,
      state:              initialState,
      draft,
      warnings,
    }

    return {
      status:     'ok',
      bindingHash,
      readiness,
      state:      initialState,
      prepared:   token as unknown as PreparedCapabilityBinding,
      validation: { valid: true, errors: [], warnings },
    }
  }

  function materialize(
    prepared: PreparedCapabilityBinding,
    options?: { readonly supersedesBindingId?: CapabilityBindingId },
  ): CapabilityBinding {
    const token = prepared as unknown as PreparedTokenInternal
    const { draft, boundProviders, hashProjection, bindingHash } = token

    const supersedesId = options?.supersedesBindingId

    // If supersedesBindingId provided, recompute hash with it included
    let finalHash = bindingHash
    if (supersedesId !== undefined) {
      const projectionWithSupersedes: CapabilityBindingHashProjection = {
        ...hashProjection,
        supersedesBindingId: supersedesId,
      }
      finalHash = computeBindingHash(projectionWithSupersedes)
    }

    const bindingId = idGenerator.generate() as CapabilityBindingId
    const createdAt = clock.now()

    const binding: CapabilityBinding = {
      bindingId,
      bindingHash:         finalHash,
      schemaVersion:       '1.0',
      setId:               draft.setId,
      semanticHash:        draft.semanticHash,
      requirementId:       draft.requirementId,
      requirementHash:     draft.requirementHash,
      capabilityId:        draft.capabilityId,
      multiplicity:        draft.multiplicity,
      providers:           boundProviders,
      resolutionId:        draft.resolutionId,
      resolutionEntryHash: hashProjection.resolutionEntryHash,
      createdAt,
      ...(supersedesId !== undefined && { supersedesBindingId: supersedesId }),
    }

    return deepFreeze(binding)
  }

  function supersede(
    existing: import('@rohinik-org/capability-binding-ir').CapabilityBindingRecord,
    replacementDraft: CapabilityBindingDraft,
    context: CapabilityBindingBuildContext,
  ): CapabilityBindingSupersessionResult {
    if (existing.state === 'superseded') {
      throw new Error('BINDING_ALREADY_SUPERSEDED: Cannot supersede a binding that is already superseded')
    }

    const prepResult = prepare(replacementDraft, context)
    if (prepResult.status === 'invalid') {
      throw new Error(
        'Supersession replacement draft is invalid: ' +
        prepResult.validation.errors.map(e => e.message).join('; '),
      )
    }

    const replacement = materialize(prepResult.prepared, { supersedesBindingId: existing.binding.bindingId })
    const now = clock.now()

    const previousRecord: CapabilityBindingRecord = deepFreeze({
      binding:      existing.binding,
      state:        'superseded' as const,
      stateVersion: existing.stateVersion + 1,
      updatedAt:    now,
      readiness:    existing.readiness,
      installations: existing.installations,
    })

    const replacementRecord: CapabilityBindingRecord = deepFreeze({
      binding:      replacement,
      state:        prepResult.state,
      stateVersion: 1,
      updatedAt:    now,
      readiness:    prepResult.readiness,
      installations: extractInstallations(context),
    })

    return { previous: previousRecord, replacement: replacementRecord }
  }

  return { prepare, materialize, supersede }
}

// --- Readiness helpers ---

function computePerProviderReadiness(
  draft: CapabilityBindingDraft,
  boundProviders: readonly BoundProviderReference[],
  installationArtifact: import('@rohinik-org/capability-binding-ir').CapabilityInstallationArtifactProjection | undefined,
  lockArtifact: import('@rohinik-org/capability-binding-ir').CapabilityLockArtifactProjection | undefined,
  trustArtifact: import('@rohinik-org/capability-binding-ir').CapabilityTrustArtifactProjection | undefined,
): readonly CapabilityProviderReadiness[] {
  return draft.providers.map(p => {
    const missing: CapabilityBindingPrerequisite[] = []

    // Installation prerequisite
    const installEntry = installationArtifact?.installations.find(e => e.providerId === p.providerId)
    if (!installEntry) {
      missing.push('provider-installation')
    }

    // Lock entry prerequisite — only satisfied when artifact present AND entry verified
    const bp = boundProviders.find(b => b.providerId === p.providerId)
    if (!bp?.lockEntryHash) {
      missing.push('lock-entry')
    }

    // Trust decision prerequisite — only satisfied when artifact present AND decision trusted
    if (!bp?.trustDecisionHash) {
      missing.push('trust-decision')
    }

    return {
      providerId: p.providerId,
      ready:      missing.length === 0,
      missing,
    }
  })
}

export function deriveStateFromReadiness(
  readiness: CapabilityBindingReadiness,
): Exclude<CapabilityBindingState, 'active' | 'invalidated' | 'superseded'> {
  const anyMissingInstallation = readiness.providers.some(r => r.missing.includes('provider-installation'))
  if (anyMissingInstallation) return 'planned'

  const anyMissingLockOrTrust = readiness.providers.some(
    r => r.missing.includes('lock-entry') || r.missing.includes('trust-decision'),
  )
  if (anyMissingLockOrTrust) return 'installed'

  return 'ready-for-activation'
}

function extractInstallations(
  context: import('@rohinik-org/capability-binding-ir').CapabilityBindingBuildContext,
): readonly import('@rohinik-org/capability-binding-ir').CapabilityProviderInstallationState[] {
  if (!context.installationArtifact) return []
  return context.installationArtifact.installations.map(e => ({
    providerId:            e.providerId,
    installationId:        e.installationId,
    installationPath:      e.installationPath,
    installationEntryHash: e.installationEntryHash,
  }))
}
