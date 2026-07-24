import { canonicalStringify } from './canonicalizer.js'
import { parseVersionRange } from './version.js'
import { computeRequirementHash, computeSetHash } from './hash.js'
import { CAPABILITY_ID_PATTERN } from '@rohinik-org/capability-ir'
import {
  RequirementValidationErrorCode as EC,
  RequirementValidationWarningCode as WC,
  TRUST_LEVEL_RANK,
  InvalidPreparedSetError,
  ForeignPreparedSetError,
  PreparedSetAlreadyConsumedError,
} from '@rohinik-org/capability-contracts-ir'
import type {
  CapabilityId,
  ApplicationId,
  ProviderId,
} from '@rohinik-org/capability-ir'
import type {
  Clock,
  IdGenerator,
  IsoTimestamp,
  JsonValue,
  OperationId,
  VersionRange,
  VersionRangeExpression,
  ContentHash,
  TrustLevel,
  CapabilityMultiplicity,
  CapabilityConstraint,
  CapabilityPreference,
  ProviderOverrideConstraint,
  CapabilityFallbackPolicy,
  CapabilityDegradationPolicy,
  RequirementOrigin,
  RequirementOriginEntry,
  RequirementHashProjection,
  RequirementHashFallbackPolicy,
  RequirementSetHashProjection,
  CapabilityRequirement,
  CapabilityRequirementSet,
  CapabilityRequirementId,
  CapabilityRequirementSetId,
  CapabilityRequirementHash,
  CapabilityRequirementSetHash,
  CapabilityRequirementDraft,
  CapabilityRequirementSetDraft,
  CapabilityRequirementBuilder,
  CapabilityRequirementPreparationResult,
  CapabilityRequirementMaterializationResult,
  InternedCapabilityRequirementSet,
  PreparedRequirementSet,
  RequirementValidationError,
  RequirementValidationWarning,
  RequirementValidationResult,
} from '@rohinik-org/capability-contracts-ir'

// ──────────────────────────────────────────────────────────────────────────────
// Utility
// ──────────────────────────────────────────────────────────────────────────────

const MONEY_RE = /^(0|[1-9][0-9]*)$/
const CONTENT_HASH_RE = /^[a-f0-9]{64}$/
const RUNTIME_LANG_RE = /^[a-z][a-z0-9._-]*$/
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  Object.freeze(obj)
  for (const key of Object.keys(obj)) {
    deepFreeze((obj as Record<string, unknown>)[key])
  }
  return obj
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false
  const p = Object.getPrototypeOf(v)
  return p === Object.prototype || p === null
}

// Prepared token internal shape (never inspected by consumers).
interface NormalizedRequirement {
  readonly suppliedRequirementId: string | undefined
  readonly requirementHash: CapabilityRequirementHash
  readonly capabilityId: CapabilityId
  readonly versionRange: VersionRange
  readonly necessity: 'required' | 'optional'
  readonly multiplicity: CapabilityMultiplicity
  readonly constraints: readonly CapabilityConstraint[]
  readonly preferences: readonly CapabilityPreference[]
  readonly providerOverride: ProviderOverrideConstraint | undefined
  readonly fallbackPolicy: CapabilityFallbackPolicy | undefined
  readonly degradationPolicy: CapabilityDegradationPolicy | undefined
  readonly requestedBy: RequirementOrigin
}

interface PreparedInternal {
  readonly requirements: readonly NormalizedRequirement[]
  readonly applicationId: ApplicationId | undefined
  readonly operationId: OperationId | undefined
  readonly semanticHash: CapabilityRequirementSetHash
  readonly suppliedSetId: CapabilityRequirementSetId | undefined
}

// ──────────────────────────────────────────────────────────────────────────────
// Builder
// ──────────────────────────────────────────────────────────────────────────────

class Builder implements CapabilityRequirementBuilder {
  private readonly owned = new WeakMap<object, PreparedInternal>()
  private readonly consumed = new WeakSet<object>()

  constructor(private readonly idGenerator: IdGenerator, private readonly clock: Clock) {}

  prepare(draft: CapabilityRequirementSetDraft): CapabilityRequirementPreparationResult {
    const errors: RequirementValidationError[] = []
    const warnings: RequirementValidationWarning[] = []

    const applicationId = draft.applicationId !== undefined ? (draft.applicationId as ApplicationId) : undefined
    const operationId = draft.operationId !== undefined ? (draft.operationId as OperationId) : undefined
    const suppliedSetId =
      draft.setId !== undefined && draft.setId.trim() !== '' ? (draft.setId as CapabilityRequirementSetId) : undefined

    const normalized: NormalizedRequirement[] = []
    const seenRequirementIds = new Set<string>()

    draft.requirements.forEach((req, ri) => {
      const path = `requirements[${ri}]`
      const nr = normalizeRequirement(req, ri, path, errors, warnings, seenRequirementIds)
      if (nr !== undefined) normalized.push(nr)
    })

    if (errors.length > 0) {
      return { status: 'invalid', validation: { valid: false, errors, warnings } }
    }

    // §18.2 step 8 — semanticHash over RequirementSetHashProjection.
    const setProjection: RequirementSetHashProjection = {
      schemaVersion: '1.0',
      ...(applicationId !== undefined ? { applicationId } : {}),
      ...(operationId !== undefined ? { operationId } : {}),
      requirementHashes: normalized.map((r) => r.requirementHash),
    }
    const semanticHash = computeSetHash(setProjection)

    const internal: PreparedInternal = {
      requirements: normalized,
      applicationId,
      operationId,
      semanticHash,
      suppliedSetId,
    }

    const token = mintToken()
    this.owned.set(token, internal)

    return {
      status: 'ok',
      semanticHash,
      ...(suppliedSetId !== undefined ? { suppliedSetId } : {}),
      prepared: token as unknown as PreparedRequirementSet,
      validation: { valid: true, errors, warnings },
    }
  }

  materialize(
    prepared: PreparedRequirementSet,
    envelope?: { readonly setId?: CapabilityRequirementSetId },
  ): CapabilityRequirementMaterializationResult {
    const token = prepared as unknown as object
    if (token === null || (typeof token !== 'object')) {
      throw new InvalidPreparedSetError('Prepared token is not an object')
    }
    const internal = this.owned.get(token)
    if (internal === undefined) {
      if (this.consumed.has(token)) {
        throw new PreparedSetAlreadyConsumedError('Prepared token already consumed')
      }
      // Never owned by this builder. Could be foreign or forged — we cannot tell them
      // apart without a global registry. Spec T-58 uses a token from another builder,
      // T-59 uses a plain object. Distinguish: a real token is a frozen empty object with
      // null-ish prototype-of Object and no own keys AND carries our private marker.
      if (isBuilderToken(token)) {
        throw new ForeignPreparedSetError('Prepared token was produced by a different builder')
      }
      throw new InvalidPreparedSetError('Value is not a valid PreparedRequirementSet')
    }

    // Consume single-use token.
    this.owned.delete(token)
    this.consumed.add(token)

    const createdAt: IsoTimestamp = this.clock.now()
    const setId: CapabilityRequirementSetId =
      envelope?.setId ?? internal.suppliedSetId ?? (this.idGenerator.generate() as CapabilityRequirementSetId)

    const requirements: CapabilityRequirement[] = internal.requirements.map((r) => {
      const requirementId: CapabilityRequirementId =
        r.suppliedRequirementId !== undefined && r.suppliedRequirementId.trim() !== ''
          ? (r.suppliedRequirementId as CapabilityRequirementId)
          : (this.idGenerator.generate() as CapabilityRequirementId)
      return {
        requirementId,
        requirementHash: r.requirementHash,
        capabilityId: r.capabilityId,
        versionRange: r.versionRange,
        necessity: r.necessity,
        multiplicity: r.multiplicity,
        constraints: r.constraints,
        preferences: r.preferences,
        ...(r.providerOverride !== undefined ? { providerOverride: r.providerOverride } : {}),
        ...(r.fallbackPolicy !== undefined ? { fallbackPolicy: r.fallbackPolicy } : {}),
        ...(r.degradationPolicy !== undefined ? { degradationPolicy: r.degradationPolicy } : {}),
        requestedBy: r.requestedBy,
      }
    })

    const set: CapabilityRequirementSet = {
      setId,
      semanticHash: internal.semanticHash,
      schemaVersion: '1.0',
      ...(internal.applicationId !== undefined ? { applicationId: internal.applicationId } : {}),
      ...(internal.operationId !== undefined ? { operationId: internal.operationId } : {}),
      requirements,
      createdAt,
    }

    const cloned = structuredClone(set)
    deepFreeze(cloned)

    const interned: InternedCapabilityRequirementSet = {
      set: cloned,
      envelopeIdentity: deepFreeze({
        setId,
        createdAt,
        semanticHash: internal.semanticHash,
      }),
    }
    return { interned }
  }
}

// A builder token is a frozen empty plain object we minted. Foreign builder tokens look
// identical structurally (also frozen empty objects). We tag them with a shared brand
// symbol so we can distinguish "a token from some Builder" (foreign) from "a forged plain
// object" (invalid). The tag is non-enumerable so it never affects hashing/serialization.
const TOKEN_BRAND = Symbol('capability-contracts.prepared-token')

function mintToken(): object {
  const t: Record<string | symbol, unknown> = {}
  Object.defineProperty(t, TOKEN_BRAND, { value: true, enumerable: false, writable: false, configurable: false })
  return Object.freeze(t)
}

function isBuilderToken(v: object): boolean {
  return (v as Record<symbol, unknown>)[TOKEN_BRAND] === true
}

// ──────────────────────────────────────────────────────────────────────────────
// Per-requirement normalization + validation
// ──────────────────────────────────────────────────────────────────────────────

const REQUIREMENT_KNOWN_FIELDS = new Set([
  'requirementId',
  'capabilityId',
  'versionRange',
  'necessity',
  'multiplicity',
  'constraints',
  'preferences',
  'providerOverride',
  'fallbackPolicy',
  'degradationPolicy',
  'requestedBy',
])

function normalizeRequirement(
  req: CapabilityRequirementDraft,
  ri: number,
  path: string,
  errors: RequirementValidationError[],
  warnings: RequirementValidationWarning[],
  seenRequirementIds: Set<string>,
): NormalizedRequirement | undefined {
  const before = errors.length

  // UNKNOWN_FIELD detection on requirement object.
  for (const k of Object.keys(req as unknown as Record<string, unknown>)) {
    if (!REQUIREMENT_KNOWN_FIELDS.has(k)) {
      errors.push({ code: EC.UNKNOWN_FIELD, path: `${path}.${k}`, message: `Unknown field: ${k}` })
    }
  }

  // requirementId uniqueness
  const suppliedRequirementId = req.requirementId
  if (suppliedRequirementId !== undefined && suppliedRequirementId.trim() !== '') {
    if (seenRequirementIds.has(suppliedRequirementId)) {
      errors.push({
        code: EC.DUPLICATE_REQUIREMENT_ID,
        path: `${path}.requirementId`,
        message: `Duplicate requirementId: ${suppliedRequirementId}`,
      })
    }
    seenRequirementIds.add(suppliedRequirementId)
  }

  // capabilityId
  if (typeof req.capabilityId !== 'string' || !CAPABILITY_ID_PATTERN.test(req.capabilityId)) {
    errors.push({
      code: EC.INVALID_CAPABILITY_ID,
      path: `${path}.capabilityId`,
      message: `Invalid capabilityId: ${String(req.capabilityId)}`,
    })
  }
  const capabilityId = req.capabilityId as CapabilityId

  // versionRange
  let versionRange: VersionRange | undefined
  try {
    versionRange = parseVersionRange(req.versionRange)
  } catch {
    errors.push({
      code: EC.UNPARSEABLE_VERSION_RANGE,
      path: `${path}.versionRange`,
      message: `Unparseable version range: ${String(req.versionRange)}`,
    })
  }

  // necessity / multiplicity
  const necessity = req.necessity ?? 'required'
  if (necessity !== 'required' && necessity !== 'optional') {
    errors.push({ code: EC.INVALID_MULTIPLICITY, path: `${path}.necessity`, message: `Invalid necessity: ${String(necessity)}` })
  }
  const multiplicity = req.multiplicity ?? 'single'
  if (multiplicity !== 'single' && multiplicity !== 'one-or-more' && multiplicity !== 'all-compatible') {
    errors.push({ code: EC.INVALID_MULTIPLICITY, path: `${path}.multiplicity`, message: `Invalid multiplicity: ${String(multiplicity)}` })
  }

  // constraints
  const rawConstraints = Array.isArray(req.constraints) ? req.constraints : []
  const validatedConstraints = rawConstraints
    .map((c, ci) => validateConstraint(c, `${path}.constraints[${ci}]`, errors))
    .filter((c): c is ParsedConstraint => c !== undefined)

  // preferences (validate + pipeline)
  const rawPreferences = Array.isArray(req.preferences) ? req.preferences : []
  const validatedPreferences = rawPreferences.map((p, pi) => validatePreference(p, `${path}.preferences[${pi}]`, errors))

  // providerOverride
  let providerOverride: ProviderOverrideConstraint | undefined
  if (req.providerOverride !== undefined && req.providerOverride !== null) {
    providerOverride = validateProviderOverride(req.providerOverride, `${path}.providerOverride`, errors)
  }

  // fallbackPolicy
  let fallbackPolicy: CapabilityFallbackPolicy | undefined
  if (req.fallbackPolicy !== undefined && req.fallbackPolicy !== null) {
    fallbackPolicy = validateFallback(req.fallbackPolicy, capabilityId, `${path}.fallbackPolicy`, errors)
  }

  // degradationPolicy
  let degradationPolicy: CapabilityDegradationPolicy | undefined
  if (req.degradationPolicy !== undefined && req.degradationPolicy !== null) {
    degradationPolicy = validateDegradation(req.degradationPolicy, `${path}.degradationPolicy`, warnings, req.requirementId as CapabilityRequirementId | undefined)
  }

  // requestedBy (origin) — L-9E2-004
  const requestedBy = validateOrigin(req.requestedBy, `${path}.requestedBy`, errors)

  // Preference pipeline (§18.2 step 3) — needs execution-location soft constraint conversion.
  const { preferences, remainingConstraints } = runPreferencePipeline(
    validatedPreferences,
    validatedConstraints,
    path,
    errors,
  )

  // Constraint normalization (§20).
  const normalizedConstraints = normalizeConstraints(remainingConstraints, path, errors, warnings, req.requirementId as CapabilityRequirementId | undefined)

  if (errors.length > before) return undefined
  if (versionRange === undefined || requestedBy === undefined) return undefined

  // Build hash projection (§15).
  const projection: RequirementHashProjection = {
    capabilityId,
    versionRange: versionRange.normalized,
    necessity,
    multiplicity,
    constraints: normalizedConstraints,
    preferences,
    ...(providerOverride !== undefined ? { providerOverride } : {}),
    ...(fallbackPolicy !== undefined ? { fallbackPolicy: fallbackToHashProjection(fallbackPolicy) } : {}),
    ...(degradationPolicy !== undefined ? { degradationPolicy } : {}),
    requestedBy,
  }
  const requirementHash = computeRequirementHash(projection)

  return {
    suppliedRequirementId: suppliedRequirementId,
    requirementHash,
    capabilityId,
    versionRange,
    necessity,
    multiplicity,
    constraints: normalizedConstraints,
    preferences,
    providerOverride,
    fallbackPolicy,
    degradationPolicy,
    requestedBy,
  }
  void ri
}

function fallbackToHashProjection(fb: CapabilityFallbackPolicy): RequirementHashFallbackPolicy {
  if (fb.kind === 'use-alternative') {
    return {
      kind: 'use-alternative',
      alternative: {
        capabilityId: fb.alternative.capabilityId,
        versionRange: fb.alternative.versionRange.normalized,
      },
    }
  }
  return fb
}

// ──────────────────────────────────────────────────────────────────────────────
// Constraint validation
// ──────────────────────────────────────────────────────────────────────────────

type ParsedConstraint = { constraint: CapabilityConstraint; path: string }

function validateInteger(
  value: unknown,
  path: string,
  errors: RequirementValidationError[],
  negativeCode: typeof EC.NEGATIVE_LATENCY | typeof EC.NEGATIVE_CAPACITY,
): boolean {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    errors.push({ code: EC.NON_INTEGER_NUMERIC_FIELD, path, message: `Not a finite number: ${String(value)}` })
    return false
  }
  if (!Number.isInteger(value)) {
    errors.push({ code: EC.NON_INTEGER_NUMERIC_FIELD, path, message: `Not an integer: ${value}` })
    return false
  }
  if (value <= 0) {
    errors.push({ code: negativeCode, path, message: `Must be positive: ${value}` })
    return false
  }
  if (value > Number.MAX_SAFE_INTEGER) {
    errors.push({ code: EC.NUMERIC_FIELD_OUT_OF_RANGE, path, message: `Exceeds MAX_SAFE_INTEGER: ${value}` })
    return false
  }
  return true
}

function validateMoney(value: unknown, path: string, errors: RequirementValidationError[]): boolean {
  if (!isPlainObject(value) || value['currency'] !== 'USD' || typeof value['micros'] !== 'string' || !MONEY_RE.test(value['micros'])) {
    errors.push({ code: EC.INVALID_MONEY_MICROS, path, message: `Invalid MoneyAmount: ${JSON.stringify(value)}` })
    return false
  }
  return true
}

function validateConstraint(c: unknown, path: string, errors: RequirementValidationError[]): ParsedConstraint | undefined {
  if (!isPlainObject(c) || typeof c['kind'] !== 'string') {
    errors.push({ code: EC.UNKNOWN_FIELD, path, message: `Invalid constraint` })
    return undefined
  }
  const kind = c['kind']
  const before = errors.length
  switch (kind) {
    case 'runtime': {
      if (typeof c['language'] !== 'string' || !RUNTIME_LANG_RE.test((c['language'] as string).toLowerCase().trim())) {
        errors.push({ code: EC.INVALID_RUNTIME_LANGUAGE, path: `${path}.language`, message: `Invalid runtime language` })
      }
      break
    }
    case 'platform':
    case 'data-residency':
    case 'execution-location':
    case 'privacy':
    case 'trust':
      break
    case 'latency': {
      if (c['percentile'] === undefined) {
        errors.push({ code: EC.MISSING_LATENCY_PERCENTILE, path, message: `Latency percentile is required` })
      }
      validateInteger(c['maximumMs'], `${path}.maximumMs`, errors, EC.NEGATIVE_LATENCY)
      break
    }
    case 'cost': {
      for (const f of ['maximumPerCall', 'maximumPerMillionInputTokens', 'maximumPerMillionOutputTokens']) {
        if (c[f] !== undefined) validateMoney(c[f], `${path}.${f}`, errors)
      }
      break
    }
    case 'context-capacity': {
      if (c['minimumContextTokens'] !== undefined) validateInteger(c['minimumContextTokens'], `${path}.minimumContextTokens`, errors, EC.NEGATIVE_CAPACITY)
      if (c['minimumOutputTokens'] !== undefined) validateInteger(c['minimumOutputTokens'], `${path}.minimumOutputTokens`, errors, EC.NEGATIVE_CAPACITY)
      break
    }
    case 'permission': {
      const required = c['required']
      const forbidden = c['forbidden']
      if (Array.isArray(required) && Array.isArray(forbidden)) {
        const overlap = required.filter((x) => forbidden.includes(x))
        if (overlap.length > 0) {
          errors.push({ code: EC.CONTRADICTORY_CONSTRAINTS, path, message: `Permission in both required and forbidden: ${overlap.join(',')}` })
        }
      }
      break
    }
    case 'feature': {
      const required = c['requiredFeatures']
      const forbidden = c['forbiddenFeatures']
      if (Array.isArray(required) && Array.isArray(forbidden)) {
        const overlap = required.filter((x) => forbidden.includes(x))
        if (overlap.length > 0) {
          errors.push({ code: EC.CONTRADICTORY_CONSTRAINTS, path, message: `Feature in both required and forbidden: ${overlap.join(',')}` })
        }
      }
      break
    }
    default:
      errors.push({ code: EC.UNKNOWN_FIELD, path: `${path}.kind`, message: `Unknown constraint kind: ${kind}` })
      return undefined
  }

  // Reject hard local-preferred (§27.18).
  if (kind === 'execution-location' && c['mode'] === 'local-preferred' && c['hardness'] === 'hard') {
    errors.push({ code: EC.CONTRADICTORY_CONSTRAINTS, path, message: `local-preferred requires hardness='soft'` })
  }

  if (errors.length > before) return undefined
  // Normalize runtime language (lowercase, trimmed).
  const normalized = { ...c } as Record<string, unknown>
  if (kind === 'runtime' && typeof normalized['language'] === 'string') {
    normalized['language'] = (normalized['language'] as string).toLowerCase().trim()
  }
  return { constraint: normalized as unknown as CapabilityConstraint, path }
}

function validatePreference(p: unknown, path: string, errors: RequirementValidationError[]): { pref: CapabilityPreference; path: string } | undefined {
  if (!isPlainObject(p) || typeof p['kind'] !== 'string') {
    errors.push({ code: EC.UNKNOWN_FIELD, path, message: `Invalid preference` })
    return undefined
  }
  const w = p['weight']
  if (typeof w !== 'number' || !Number.isFinite(w) || w < 0 || w > 1) {
    errors.push({ code: EC.INVALID_WEIGHT, path: `${path}.weight`, message: `Invalid weight: ${String(w)}` })
    return undefined
  }
  return { pref: p as unknown as CapabilityPreference, path }
}

function validateProviderOverride(v: unknown, path: string, errors: RequirementValidationError[]): ProviderOverrideConstraint | undefined {
  if (!isPlainObject(v)) return undefined
  if (typeof v['reason'] !== 'string' || v['reason'].trim() === '') {
    errors.push({ code: EC.PROVIDER_OVERRIDE_MISSING_REASON, path: `${path}.reason`, message: `Provider override requires non-empty reason` })
    return undefined
  }
  return {
    kind: 'provider-override',
    providerId: v['providerId'] as ProviderId,
    reason: v['reason'],
    hardness: 'hard',
  }
}

function validateFallback(
  v: unknown,
  ownCapabilityId: CapabilityId,
  path: string,
  errors: RequirementValidationError[],
): CapabilityFallbackPolicy | undefined {
  if (!isPlainObject(v) || typeof v['kind'] !== 'string') return undefined
  const kind = v['kind']
  if (kind === 'use-alternative') {
    const alt = v['alternative']
    if (!isPlainObject(alt)) return undefined
    if (alt['capabilityId'] === ownCapabilityId) {
      errors.push({ code: EC.FALLBACK_SELF_REFERENCE, path: `${path}.alternative.capabilityId`, message: `Fallback references own capabilityId` })
      return undefined
    }
    let vr: VersionRange
    try {
      vr = parseVersionRange(alt['versionRange'] as string)
    } catch {
      errors.push({ code: EC.UNPARSEABLE_VERSION_RANGE, path: `${path}.alternative.versionRange`, message: `Unparseable fallback version range` })
      return undefined
    }
    return { kind: 'use-alternative', alternative: { capabilityId: alt['capabilityId'] as CapabilityId, versionRange: vr } }
  }
  if (kind === 'use-stub') {
    if (typeof v['behaviorContractHash'] !== 'string' || !CONTENT_HASH_RE.test(v['behaviorContractHash'])) {
      errors.push({ code: EC.INVALID_CONTENT_HASH, path: `${path}.behaviorContractHash`, message: `Invalid ContentHash` })
      return undefined
    }
    return { kind: 'use-stub', stubId: v['stubId'] as string, behaviorContractHash: v['behaviorContractHash'] as ContentHash }
  }
  if (kind === 'fail-fast') return { kind: 'fail-fast' }
  return undefined
}

function validateDegradation(
  v: unknown,
  path: string,
  warnings: RequirementValidationWarning[],
  requirementId: CapabilityRequirementId | undefined,
): CapabilityDegradationPolicy | undefined {
  if (!isPlainObject(v) || typeof v['kind'] !== 'string') return undefined
  const kind = v['kind']
  if (kind === 'allow-degraded') {
    warnings.push({
      code: WC.DEGRADATION_THRESHOLD_DEFERRED,
      path,
      ...(requirementId !== undefined ? { requirementId } : {}),
      message: `Degradation threshold deferred to Stage 11D`,
    })
    return { kind: 'allow-degraded' }
  }
  if (kind === 'reject-degraded') return { kind: 'reject-degraded' }
  if (kind === 'escalate') return { kind: 'escalate', escalationCapabilityId: v['escalationCapabilityId'] as CapabilityId }
  return undefined
}

// ──────────────────────────────────────────────────────────────────────────────
// Origin validation (§14, L-9E2-004)
// ──────────────────────────────────────────────────────────────────────────────

const HUMAN_SYSTEM_KINDS = new Set(['application', 'subsystem', 'operation'])

function originIdentityKeyLocal(entry: RequirementOriginEntry): string {
  switch (entry.kind) {
    case 'application': return `application:${entry.applicationId}`
    case 'subsystem': return `subsystem:${entry.subsystemName}`
    case 'package': return `package:${entry.packageId}@${entry.packageVersion}`
    case 'operation': return `operation:${entry.operationId}`
    case 'policy': return `policy:${entry.policyId}@${entry.policyVersion}`
  }
}

function entryIdentifiers(entry: RequirementOriginEntry): string[] {
  switch (entry.kind) {
    case 'application': return [entry.applicationId]
    case 'subsystem': return [entry.subsystemName]
    case 'package': return [entry.packageId, entry.packageVersion]
    case 'operation': return [entry.operationId]
    case 'policy': return [entry.policyId, entry.policyVersion]
  }
}

function validateOrigin(v: unknown, path: string, errors: RequirementValidationError[]): RequirementOrigin | undefined {
  const before = errors.length
  if (!isPlainObject(v) || !isPlainObject(v['direct'])) {
    errors.push({ code: EC.INVALID_ORIGIN_CHAIN, path, message: `Missing origin.direct` })
    return undefined
  }
  const direct = v['direct'] as RequirementOriginEntry
  const chainRaw = v['chain']
  const chain = Array.isArray(chainRaw) ? (chainRaw as RequirementOriginEntry[]) : []

  if (chain.length > 10) {
    errors.push({ code: EC.INVALID_ORIGIN_CHAIN, path: `${path}.chain`, message: `Origin chain exceeds depth 10` })
  }

  const all: RequirementOriginEntry[] = [direct, ...chain]
  // Empty identifier check.
  all.forEach((entry, idx) => {
    if (!isPlainObject(entry) || typeof entry['kind'] !== 'string') {
      errors.push({ code: EC.INVALID_ORIGIN_CHAIN, path: idx === 0 ? `${path}.direct` : `${path}.chain[${idx - 1}]`, message: `Invalid origin entry` })
      return
    }
    const ids = entryIdentifiers(entry)
    if (ids.some((s) => typeof s !== 'string' || (s as string).trim() === '')) {
      errors.push({ code: EC.EMPTY_ORIGIN_IDENTIFIER, path: idx === 0 ? `${path}.direct` : `${path}.chain[${idx - 1}]`, message: `Empty origin identifier` })
    }
  })

  if (errors.length > before) return undefined

  // Duplicate identity key check.
  const seen = new Set<string>()
  for (const entry of all) {
    const key = originIdentityKeyLocal(entry)
    if (seen.has(key)) {
      errors.push({ code: EC.ORIGIN_IDENTITY_REPEATED, path, message: `Repeated origin identity: ${key}` })
      return undefined
    }
    seen.add(key)
  }

  // policy direct requires human/system ancestor in chain.
  if (direct.kind === 'policy') {
    const hasAncestor = chain.some((e) => HUMAN_SYSTEM_KINDS.has(e.kind))
    if (!hasAncestor) {
      errors.push({ code: EC.INVALID_ORIGIN_CHAIN, path, message: `policy origin requires human/system-initiated ancestor` })
      return undefined
    }
  }

  return { direct, chain }
}

// ──────────────────────────────────────────────────────────────────────────────
// Preference pipeline (§9.1, §18.2 step 3)
// ──────────────────────────────────────────────────────────────────────────────

function runPreferencePipeline(
  validated: (({ pref: CapabilityPreference; path: string }) | undefined)[],
  constraints: ParsedConstraint[],
  reqPath: string,
  errors: RequirementValidationError[],
): { preferences: readonly CapabilityPreference[]; remainingConstraints: ParsedConstraint[] } {
  // 3b — remove zero-weight, keep only valid.
  const prefs: { pref: CapabilityPreference; path: string }[] = validated
    .filter((p): p is { pref: CapabilityPreference; path: string } => p !== undefined && p.pref.weight !== 0)

  // 3c — convert soft local-preferred execution-location constraint to a preference.
  const remainingConstraints: ParsedConstraint[] = []
  const convertedLocalPrefs: { weight: number; path: string }[] = []
  for (const pc of constraints) {
    const c = pc.constraint
    if (c.kind === 'execution-location' && c.mode === 'local-preferred' && constraintHardnessOf(c) === 'soft') {
      convertedLocalPrefs.push({ weight: 1.0, path: pc.path })
    } else {
      remainingConstraints.push(pc)
    }
  }

  for (const conv of convertedLocalPrefs) {
    // §9.1 collision: existing ExecutionLocationPreference.
    const existingIdx = prefs.findIndex((p) => p.pref.kind === 'execution-location')
    if (existingIdx >= 0) {
      const existing = prefs[existingIdx]!.pref as CapabilityPreference & { preferred: 'local' | 'remote'; weight: number }
      if (existing.preferred === 'local') {
        prefs[existingIdx] = {
          pref: { kind: 'execution-location', preferred: 'local', weight: Math.max(existing.weight, conv.weight) },
          path: prefs[existingIdx]!.path,
        }
      } else {
        errors.push({
          code: EC.CONTRADICTORY_PREFERENCES,
          path: conv.path,
          relatedPaths: [prefs[existingIdx]!.path],
          message: `local-preferred conflicts with remote ExecutionLocationPreference`,
        })
      }
    } else {
      prefs.push({ pref: { kind: 'execution-location', preferred: 'local', weight: conv.weight }, path: conv.path })
    }
  }

  // 3e — duplicate kind rejection (after zero-weight removal + conversion).
  const byKind = new Map<string, string[]>()
  for (const p of prefs) {
    const list = byKind.get(p.pref.kind) ?? []
    list.push(p.path)
    byKind.set(p.pref.kind, list)
  }
  for (const [kind, paths] of byKind) {
    if (paths.length > 1) {
      errors.push({
        code: EC.DUPLICATE_PREFERENCE_KIND,
        path: paths[0]!,
        relatedPaths: paths.slice(1),
        message: `Duplicate preference kind: ${kind}`,
      })
    }
  }

  void reqPath
  return { preferences: prefs.map((p) => p.pref), remainingConstraints }
}

function constraintHardnessOf(c: CapabilityConstraint): 'hard' | 'soft' {
  switch (c.kind) {
    case 'data-residency':
    case 'privacy':
    case 'permission':
      return 'hard'
    default:
      return (c as { hardness: 'hard' | 'soft' }).hardness
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Constraint normalization (§20)
// ──────────────────────────────────────────────────────────────────────────────

function normalizeConstraints(
  parsed: ParsedConstraint[],
  reqPath: string,
  errors: RequirementValidationError[],
  warnings: RequirementValidationWarning[],
  requirementId: CapabilityRequirementId | undefined,
): readonly CapabilityConstraint[] {
  const before = errors.length
  const out: CapabilityConstraint[] = []
  const redundant = (path: string): void => {
    warnings.push({
      code: WC.SOFT_CONSTRAINT_REDUNDANT,
      path,
      ...(requirementId !== undefined ? { requirementId } : {}),
      message: `Soft constraint is redundant relative to hard constraint`,
    })
  }

  // Group by kind.
  const byKind = new Map<string, ParsedConstraint[]>()
  for (const pc of parsed) {
    const list = byKind.get(pc.constraint.kind) ?? []
    list.push(pc)
    byKind.set(pc.constraint.kind, list)
  }

  for (const [kind, items] of byKind) {
    switch (kind) {
      case 'latency':
        normalizeLatency(items, out, redundant, errors)
        break
      case 'cost':
        normalizeCost(items, out, redundant)
        break
      case 'context-capacity':
        normalizeContextCapacity(items, out, redundant)
        break
      case 'data-residency':
        normalizeDataResidency(items, out, reqPath, errors)
        break
      case 'permission':
        normalizePermission(items, out, reqPath, errors)
        break
      case 'feature':
        normalizeFeature(items, out, redundant, reqPath, errors)
        break
      case 'execution-location':
        normalizeExecutionLocation(items, out, errors)
        break
      case 'platform':
        normalizePlatform(items, out, redundant, errors)
        break
      case 'runtime':
        normalizeRuntime(items, out, redundant, errors)
        break
      case 'trust':
        normalizeTrust(items, out, redundant)
        break
      case 'privacy':
        normalizePrivacy(items, out)
        break
      default:
        for (const it of items) out.push(it.constraint)
    }
  }

  if (errors.length > before) return []

  // §19 — sort constraints array: kind ascending; secondary canonicalStringify of rest.
  return out.slice().sort((a, b) => {
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1
    const sa = canonicalStringify(restOf(a) as JsonValue)
    const sb = canonicalStringify(restOf(b) as JsonValue)
    return sa < sb ? -1 : sa > sb ? 1 : 0
  })
}

function restOf(c: CapabilityConstraint): Record<string, unknown> {
  const { kind: _k, ...rest } = c as Record<string, unknown> & { kind: string }
  void _k
  return rest
}

function normalizeLatency(items: ParsedConstraint[], out: CapabilityConstraint[], redundant: (p: string) => void, _errors: RequirementValidationError[]): void {
  // group by (metric, percentile)
  const groups = new Map<string, ParsedConstraint[]>()
  for (const it of items) {
    const c = it.constraint as import('@rohinik-org/capability-contracts-ir').LatencyConstraint
    const key = `${c.metric}|${c.percentile}`
    const g = groups.get(key) ?? []
    g.push(it)
    groups.set(key, g)
  }
  for (const g of groups.values()) {
    type L = import('@rohinik-org/capability-contracts-ir').LatencyConstraint
    const hard = g.filter((x) => (x.constraint as L).hardness === 'hard')
    const soft = g.filter((x) => (x.constraint as L).hardness === 'soft')
    let hardMin: L | undefined
    if (hard.length > 0) {
      hardMin = hard.map((x) => x.constraint as L).reduce((a, b) => (a.maximumMs <= b.maximumMs ? a : b))
      out.push(hardMin)
    }
    if (soft.length > 0) {
      const softMin = soft.map((x) => x.constraint as L).reduce((a, b) => (a.maximumMs <= b.maximumMs ? a : b))
      if (hardMin !== undefined) {
        if (softMin.maximumMs >= hardMin.maximumMs) {
          const p = soft.find((x) => (x.constraint as L).maximumMs === softMin.maximumMs)!.path
          redundant(p)
        } else {
          out.push(softMin)
        }
      } else {
        out.push(softMin)
      }
    }
  }
}

function normalizeCost(items: ParsedConstraint[], out: CapabilityConstraint[], redundant: (p: string) => void): void {
  type Cst = import('@rohinik-org/capability-contracts-ir').CostConstraint
  type MoneyF = 'maximumPerCall' | 'maximumPerMillionInputTokens' | 'maximumPerMillionOutputTokens'
  const fields: MoneyF[] = ['maximumPerCall', 'maximumPerMillionInputTokens', 'maximumPerMillionOutputTokens']

  const collect = (hardness: 'hard' | 'soft'): Partial<Record<MoneyF, { amount: import('@rohinik-org/capability-contracts-ir').MoneyAmount; path: string }>> => {
    const res: Partial<Record<MoneyF, { amount: import('@rohinik-org/capability-contracts-ir').MoneyAmount; path: string }>> = {}
    for (const it of items) {
      const c = it.constraint as Cst
      if (c.hardness !== hardness) continue
      for (const f of fields) {
        const m = c[f]
        if (m === undefined) continue
        const cur = res[f]
        if (cur === undefined || BigInt(m.micros) < BigInt(cur.amount.micros)) {
          res[f] = { amount: m, path: it.path }
        }
      }
    }
    return res
  }

  const hard = collect('hard')
  const soft = collect('soft')

  // Build hard object.
  const hardObj: Record<string, unknown> = { kind: 'cost', hardness: 'hard' }
  let hardHas = false
  for (const f of fields) {
    if (hard[f] !== undefined) { hardObj[f] = hard[f]!.amount; hardHas = true }
  }
  if (hardHas) out.push(hardObj as unknown as CapabilityConstraint)

  // Soft: drop fields weaker-or-equal to hard.
  const softObj: Record<string, unknown> = { kind: 'cost', hardness: 'soft' }
  let softHas = false
  for (const f of fields) {
    const s = soft[f]
    if (s === undefined) continue
    const h = hard[f]
    if (h !== undefined && BigInt(s.amount.micros) >= BigInt(h.amount.micros)) {
      redundant(s.path)
      continue
    }
    softObj[f] = s.amount
    softHas = true
  }
  if (softHas) out.push(softObj as unknown as CapabilityConstraint)
}

function normalizeContextCapacity(items: ParsedConstraint[], out: CapabilityConstraint[], redundant: (p: string) => void): void {
  type CC = import('@rohinik-org/capability-contracts-ir').ContextCapacityConstraint
  type F = 'minimumContextTokens' | 'minimumOutputTokens'
  const fields: F[] = ['minimumContextTokens', 'minimumOutputTokens']

  const collect = (hardness: 'hard' | 'soft'): Partial<Record<F, { value: number; path: string }>> => {
    const res: Partial<Record<F, { value: number; path: string }>> = {}
    for (const it of items) {
      const c = it.constraint as CC
      if (c.hardness !== hardness) continue
      for (const f of fields) {
        const v = c[f]
        if (v === undefined) continue
        const cur = res[f]
        if (cur === undefined || v > cur.value) res[f] = { value: v, path: it.path }
      }
    }
    return res
  }

  const hard = collect('hard')
  const soft = collect('soft')

  const hardObj: Record<string, unknown> = { kind: 'context-capacity', hardness: 'hard' }
  let hardHas = false
  for (const f of fields) if (hard[f] !== undefined) { hardObj[f] = hard[f]!.value; hardHas = true }
  if (hardHas) out.push(hardObj as unknown as CapabilityConstraint)

  const softObj: Record<string, unknown> = { kind: 'context-capacity', hardness: 'soft' }
  let softHas = false
  for (const f of fields) {
    const s = soft[f]
    if (s === undefined) continue
    const h = hard[f]
    if (h !== undefined && s.value <= h.value) { redundant(s.path); continue }
    softObj[f] = s.value
    softHas = true
  }
  if (softHas) out.push(softObj as unknown as CapabilityConstraint)
}

function normalizeDataResidency(items: ParsedConstraint[], out: CapabilityConstraint[], reqPath: string, errors: RequirementValidationError[]): void {
  type DR = import('@rohinik-org/capability-contracts-ir').DataResidencyConstraint
  let acc: string[] | undefined
  for (const it of items) {
    const regions = (it.constraint as DR).allowedRegions
    acc = acc === undefined ? [...regions] : acc.filter((r) => regions.includes(r))
  }
  if (acc === undefined) return
  if (acc.length === 0) {
    errors.push({
      code: EC.CONTRADICTORY_CONSTRAINTS,
      path: items[0]!.path,
      relatedPaths: items.slice(1).map((x) => x.path),
      message: `Data residency intersection is empty`,
    })
    return
  }
  void reqPath
  out.push({ kind: 'data-residency', allowedRegions: [...new Set(acc)].sort() })
}

function normalizePermission(items: ParsedConstraint[], out: CapabilityConstraint[], reqPath: string, errors: RequirementValidationError[]): void {
  type P = import('@rohinik-org/capability-contracts-ir').PermissionConstraint
  const required = new Set<string>()
  const forbidden = new Set<string>()
  for (const it of items) {
    const c = it.constraint as P
    for (const r of c.required) required.add(r)
    for (const f of c.forbidden) forbidden.add(f)
  }
  const overlap = [...required].filter((x) => forbidden.has(x))
  if (overlap.length > 0) {
    errors.push({
      code: EC.CONTRADICTORY_CONSTRAINTS,
      path: items[0]!.path,
      relatedPaths: items.slice(1).map((x) => x.path),
      message: `Permission overlap: ${overlap.join(',')}`,
    })
    return
  }
  void reqPath
  out.push({ kind: 'permission', required: [...required].sort(), forbidden: [...forbidden].sort() })
}

function normalizeFeature(items: ParsedConstraint[], out: CapabilityConstraint[], redundant: (p: string) => void, reqPath: string, errors: RequirementValidationError[]): void {
  type F = import('@rohinik-org/capability-contracts-ir').FeatureConstraint
  const hardReq = new Set<string>()
  const hardForb = new Set<string>()
  const softReqEntries: { feats: string[]; path: string }[] = []
  const softForbEntries: { feats: string[]; path: string }[] = []
  for (const it of items) {
    const c = it.constraint as F
    if (c.hardness === 'hard') {
      for (const r of c.requiredFeatures) hardReq.add(r)
      for (const f of c.forbiddenFeatures) hardForb.add(f)
    } else {
      if (c.requiredFeatures.length > 0) softReqEntries.push({ feats: [...c.requiredFeatures], path: it.path })
      if (c.forbiddenFeatures.length > 0) softForbEntries.push({ feats: [...c.forbiddenFeatures], path: it.path })
    }
  }

  // hard required/forbidden overlap
  const hardOverlap = [...hardReq].filter((x) => hardForb.has(x))
  if (hardOverlap.length > 0) {
    errors.push({ code: EC.CONTRADICTORY_CONSTRAINTS, path: items[0]!.path, relatedPaths: items.slice(1).map((x) => x.path), message: `Feature overlap: ${hardOverlap.join(',')}` })
    return
  }
  // hard required + soft forbidden overlap
  for (const s of softForbEntries) {
    const ov = s.feats.filter((x) => hardReq.has(x))
    if (ov.length > 0) {
      errors.push({ code: EC.CONTRADICTORY_CONSTRAINTS, path: s.path, message: `Soft forbidden overlaps hard required: ${ov.join(',')}` })
      return
    }
  }
  // hard forbidden + soft required overlap
  for (const s of softReqEntries) {
    const ov = s.feats.filter((x) => hardForb.has(x))
    if (ov.length > 0) {
      errors.push({ code: EC.CONTRADICTORY_CONSTRAINTS, path: s.path, message: `Soft required overlaps hard forbidden: ${ov.join(',')}` })
      return
    }
  }

  if (hardReq.size > 0 || hardForb.size > 0) {
    out.push({ kind: 'feature', hardness: 'hard', requiredFeatures: [...hardReq].sort(), forbiddenFeatures: [...hardForb].sort() })
  }

  // Soft required: remove features that are subset of hard required; retain new ones.
  const softReqNew = new Set<string>()
  for (const s of softReqEntries) {
    const newFeats = s.feats.filter((x) => !hardReq.has(x))
    if (newFeats.length === 0) {
      redundant(s.path)
    } else {
      for (const f of newFeats) softReqNew.add(f)
    }
  }
  const softForbAll = new Set<string>()
  for (const s of softForbEntries) for (const f of s.feats) softForbAll.add(f)

  if (softReqNew.size > 0 || softForbAll.size > 0) {
    out.push({ kind: 'feature', hardness: 'soft', requiredFeatures: [...softReqNew].sort(), forbiddenFeatures: [...softForbAll].sort() })
  }
  void reqPath
}

function normalizeExecutionLocation(items: ParsedConstraint[], out: CapabilityConstraint[], errors: RequirementValidationError[]): void {
  type EL = import('@rohinik-org/capability-contracts-ir').ExecutionLocationConstraint
  // Only eligibility modes remain (local-preferred converted earlier).
  // Reduce pairwise per §20.1 matrix.
  type Mode = 'local-only' | 'remote-allowed' | 'remote-required'
  const rank: Record<Mode, number> = { 'local-only': 0, 'remote-allowed': 1, 'remote-required': 2 }
  let cur: Mode | undefined
  let curHardness: 'hard' | 'soft' = 'soft'
  let curPath = ''
  for (const it of items) {
    const c = it.constraint as EL
    // local-preferred was converted to a preference earlier; only eligibility modes remain.
    const m = c.mode as Mode
    if (cur === undefined) { cur = m; curHardness = c.hardness; curPath = it.path; continue }
    // matrix
    const a = cur, b = m
    const contradictory =
      (a === 'local-only' && b === 'remote-required') || (a === 'remote-required' && b === 'local-only')
    if (contradictory) {
      errors.push({ code: EC.CONTRADICTORY_CONSTRAINTS, path: curPath, relatedPaths: [it.path], message: `Execution-location contradiction: ${a} vs ${b}` })
      return
    }
    // merge: take the stricter (higher rank of local-only vs remote-required precedence).
    // local-only wins over remote-allowed; remote-required wins over remote-allowed.
    if (a === 'remote-allowed') { cur = b; curHardness = c.hardness; curPath = it.path }
    else if (b === 'remote-allowed') { /* keep a */ }
    else if (rank[a] >= rank[b]) { /* keep a */ } else { cur = b; curHardness = c.hardness; curPath = it.path }
  }
  if (cur !== undefined) out.push({ kind: 'execution-location', mode: cur, hardness: curHardness })
}

function normalizePlatform(items: ParsedConstraint[], out: CapabilityConstraint[], redundant: (p: string) => void, errors: RequirementValidationError[]): void {
  type PL = import('@rohinik-org/capability-contracts-ir').PlatformConstraint
  const intersect = (hardness: 'hard' | 'soft'): { os?: string; arch?: string; osPath?: string; archPath?: string; had: boolean } => {
    let os: string | undefined, arch: string | undefined, osPath: string | undefined, archPath: string | undefined
    let had = false
    let osSet = false, archSet = false
    let contradiction = false
    for (const it of items) {
      const c = it.constraint as PL
      if (c.hardness !== hardness) continue
      had = true
      if (c.os !== undefined) {
        if (!osSet) { os = c.os; osPath = it.path; osSet = true } else if (os !== c.os) contradiction = true
      }
      if (c.arch !== undefined) {
        if (!archSet) { arch = c.arch; archPath = it.path; archSet = true } else if (arch !== c.arch) contradiction = true
      }
    }
    if (contradiction) {
      errors.push({ code: EC.CONTRADICTORY_CONSTRAINTS, path: items[0]!.path, relatedPaths: items.slice(1).map((x) => x.path), message: `Platform field intersection empty` })
    }
    return { ...(os !== undefined ? { os } : {}), ...(arch !== undefined ? { arch } : {}), ...(osPath !== undefined ? { osPath } : {}), ...(archPath !== undefined ? { archPath } : {}), had }
  }
  const before = errors.length
  const hard = intersect('hard')
  const soft = intersect('soft')
  if (errors.length > before) return

  if (hard.had && (hard.os !== undefined || hard.arch !== undefined)) {
    const o: Record<string, unknown> = { kind: 'platform', hardness: 'hard' }
    if (hard.os !== undefined) o['os'] = hard.os
    if (hard.arch !== undefined) o['arch'] = hard.arch
    out.push(o as unknown as CapabilityConstraint)
  }
  if (soft.had) {
    const o: Record<string, unknown> = { kind: 'platform', hardness: 'soft' }
    let has = false
    if (soft.os !== undefined) {
      if (hard.os !== undefined) { if (soft.osPath !== undefined) redundant(soft.osPath) } else { o['os'] = soft.os; has = true }
    }
    if (soft.arch !== undefined) {
      if (hard.arch !== undefined) { if (soft.archPath !== undefined) redundant(soft.archPath) } else { o['arch'] = soft.arch; has = true }
    }
    if (has) out.push(o as unknown as CapabilityConstraint)
  }
}

function normalizeRuntime(items: ParsedConstraint[], out: CapabilityConstraint[], redundant: (p: string) => void, errors: RequirementValidationError[]): void {
  type RT = import('@rohinik-org/capability-contracts-ir').RuntimeConstraint
  const languages = new Set(items.map((x) => (x.constraint as RT).language))
  if (languages.size > 1) {
    errors.push({ code: EC.CONTRADICTORY_CONSTRAINTS, path: items[0]!.path, relatedPaths: items.slice(1).map((x) => x.path), message: `Conflicting runtime languages` })
    return
  }
  const language = [...languages][0]!
  const cmp = (a?: string, b?: string): number => {
    // greater semver wins; undefined = no minimum (lowest)
    if (a === undefined && b === undefined) return 0
    if (a === undefined) return -1
    if (b === undefined) return 1
    return semverCompare(a, b)
  }
  const hard = items.filter((x) => (x.constraint as RT).hardness === 'hard').map((x) => x.constraint as RT)
  const soft = items.filter((x) => (x.constraint as RT).hardness === 'soft')

  let hardMin: RT | undefined
  if (hard.length > 0) {
    hardMin = hard.reduce((a, b) => (cmp(a.minVersion, b.minVersion) >= 0 ? a : b))
    out.push(hardMin)
  }
  if (soft.length > 0) {
    const softMax = soft.map((x) => x.constraint as RT).reduce((a, b) => (cmp(a.minVersion, b.minVersion) >= 0 ? a : b))
    if (hardMin !== undefined) {
      // soft removed if soft minVersion <= hard minVersion.
      if (cmp(softMax.minVersion, hardMin.minVersion) <= 0) {
        const p = soft.find((x) => (x.constraint as RT).minVersion === softMax.minVersion)!.path
        redundant(p)
      } else {
        out.push(softMax)
      }
    } else {
      out.push(softMax)
    }
  }
  void language
}

function normalizeTrust(items: ParsedConstraint[], out: CapabilityConstraint[], redundant: (p: string) => void): void {
  type TC = import('@rohinik-org/capability-contracts-ir').TrustConstraint
  const rank = (t: TrustLevel): number => TRUST_LEVEL_RANK.indexOf(t)
  const hard = items.filter((x) => (x.constraint as TC).hardness === 'hard').map((x) => x.constraint as TC)
  const soft = items.filter((x) => (x.constraint as TC).hardness === 'soft')
  let hardMax: TC | undefined
  if (hard.length > 0) {
    hardMax = hard.reduce((a, b) => (rank(a.minimum) >= rank(b.minimum) ? a : b))
    out.push(hardMax)
  }
  if (soft.length > 0) {
    const softMax = soft.map((x) => x.constraint as TC).reduce((a, b) => (rank(a.minimum) >= rank(b.minimum) ? a : b))
    if (hardMax !== undefined) {
      if (rank(softMax.minimum) <= rank(hardMax.minimum)) {
        const p = soft.find((x) => (x.constraint as TC).minimum === softMax.minimum)!.path
        redundant(p)
      } else {
        out.push(softMax)
      }
    } else {
      out.push(softMax)
    }
  }
}

function normalizePrivacy(items: ParsedConstraint[], out: CapabilityConstraint[]): void {
  type PV = import('@rohinik-org/capability-contracts-ir').PrivacyConstraint
  let requiresOnPremise = false
  let forbidsExternal = false
  for (const it of items) {
    const c = it.constraint as PV
    if (c.requiresOnPremise) requiresOnPremise = true
    if (c.forbidsExternalTransmission) forbidsExternal = true
  }
  const o: Record<string, unknown> = { kind: 'privacy' }
  if (requiresOnPremise) o['requiresOnPremise'] = true
  if (forbidsExternal) o['forbidsExternalTransmission'] = true
  out.push(o as unknown as CapabilityConstraint)
}

// Minimal semver compare via node-semver.
import semver from 'semver'
function semverCompare(a: string, b: string): number {
  const av = semver.coerce(a)?.version ?? a
  const bv = semver.coerce(b)?.version ?? b
  if (semver.valid(av) && semver.valid(bv)) return semver.compare(av, bv)
  return a < b ? -1 : a > b ? 1 : 0
}

// ──────────────────────────────────────────────────────────────────────────────
// Factory + mintToken wiring (Builder needs mintToken)
// ──────────────────────────────────────────────────────────────────────────────

// Rewire Builder.prepare to use branded token instead of plain frozen object.
// (Done inline: replace token creation.)

export function createCapabilityRequirementBuilder(deps: { idGenerator: IdGenerator; clock: Clock }): CapabilityRequirementBuilder {
  return new Builder(deps.idGenerator, deps.clock)
}

// expose for repository use
export { Builder }
