import type {
  CapabilityBindingRepository,
  CapabilityBinding,
  CapabilityBindingRecord,
  CapabilityBindingId,
  CapabilityBindingHash,
  CapabilityBindingPutResult,
  CapabilityBindingInvalidationReason,
  CapabilityBindingReadiness,
  CapabilityProviderInstallationState,
  CapabilityBindingState,
  IsoTimestamp,
} from '@rohinik-org/capability-binding-ir'
import type { CapabilityRequirementId, CapabilityRequirementSetId } from '@rohinik-org/capability-contracts-ir'
import { deepFreeze } from './deep-freeze.js'
import { deriveStateFromReadiness } from './builder.js'

export function createInMemoryCapabilityBindingRepository(): CapabilityBindingRepository {
  // Primary store: bindingId → record
  const byId = new Map<CapabilityBindingId, CapabilityBindingRecord>()
  // Secondary index: bindingHash → bindingId
  const byHash = new Map<CapabilityBindingHash, CapabilityBindingId>()

  function makeRecord(
    binding: CapabilityBinding,
    state: CapabilityBindingState,
    stateVersion: number,
    updatedAt: IsoTimestamp,
    readiness: CapabilityBindingReadiness,
    installations: readonly CapabilityProviderInstallationState[],
    invalidationReason?: CapabilityBindingInvalidationReason,
  ): CapabilityBindingRecord {
    const base: Omit<CapabilityBindingRecord, 'invalidationReason'> = {
      binding, state, stateVersion, updatedAt, readiness, installations,
    }
    return deepFreeze(
      invalidationReason !== undefined
        ? { ...base, invalidationReason }
        : base,
    )
  }

  async function put(
    binding: CapabilityBinding,
    readiness: CapabilityBindingReadiness,
    installations: readonly CapabilityProviderInstallationState[],
  ): Promise<CapabilityBindingPutResult> {
    const existing = byId.get(binding.bindingId)
    if (existing !== undefined) {
      if (existing.binding.bindingHash === binding.bindingHash) {
        return { status: 'already-exists-identical', record: existing }
      }
      return { status: 'collision', bindingId: binding.bindingId }
    }

    const state = deriveStateFromReadiness(readiness)
    const now = binding.createdAt
    const record = makeRecord(binding, state, 1, now, readiness, installations)
    byId.set(binding.bindingId, record)
    byHash.set(binding.bindingHash, binding.bindingId)
    return { status: 'accepted', record }
  }

  async function get(bindingId: CapabilityBindingId): Promise<CapabilityBindingRecord | undefined> {
    return byId.get(bindingId)
  }

  async function getByHashImpl(hash: CapabilityBindingHash): Promise<CapabilityBindingRecord | undefined> {
    const id = byHash.get(hash)
    if (id === undefined) return undefined
    return byId.get(id)
  }

  async function getCurrentForRequirement(
    requirementId: CapabilityRequirementId,
  ): Promise<CapabilityBindingRecord | undefined> {
    const current: CapabilityBindingRecord[] = []
    for (const record of byId.values()) {
      if (
        record.binding.requirementId === requirementId &&
        record.state !== 'superseded' &&
        record.state !== 'invalidated'
      ) {
        current.push(record)
      }
    }
    if (current.length === 0) return undefined
    return current.sort((a, b) => b.binding.createdAt.localeCompare(a.binding.createdAt))[0]
  }

  async function listForSet(setId: CapabilityRequirementSetId): Promise<readonly CapabilityBindingRecord[]> {
    return Array.from(byId.values()).filter(r => r.binding.setId === setId)
  }

  async function refreshReadiness(
    bindingId: CapabilityBindingId,
    readiness: CapabilityBindingReadiness,
    installations: readonly CapabilityProviderInstallationState[],
    updatedAt: IsoTimestamp,
  ): Promise<CapabilityBindingRecord> {
    const existing = byId.get(bindingId)
    if (existing === undefined) throw new Error(`Binding '${bindingId}' not found`)
    if (existing.state === 'invalidated') {
      throw new Error(`Cannot refresh readiness on invalidated binding '${bindingId}'`)
    }

    const state = deriveStateFromReadiness(readiness)
    const updated = makeRecord(
      existing.binding, state, existing.stateVersion + 1, updatedAt, readiness, installations,
    )
    byId.set(bindingId, updated)
    return updated
  }

  async function invalidate(
    bindingId: CapabilityBindingId,
    reason: CapabilityBindingInvalidationReason,
    updatedAt: IsoTimestamp,
  ): Promise<CapabilityBindingRecord> {
    if (reason === undefined || reason === null) throw new Error('invalidate() requires a reason')
    const existing = byId.get(bindingId)
    if (existing === undefined) throw new Error(`Binding '${bindingId}' not found`)

    const invalidated = makeRecord(
      existing.binding, 'invalidated', existing.stateVersion + 1, updatedAt,
      existing.readiness, existing.installations, reason,
    )
    byId.set(bindingId, invalidated)
    return invalidated
  }

  async function supersede(
    existingBindingId: CapabilityBindingId,
    replacement: CapabilityBinding,
    replacementReadiness: CapabilityBindingReadiness,
    replacementInstallations: readonly CapabilityProviderInstallationState[],
    updatedAt: IsoTimestamp,
  ): Promise<import('@rohinik-org/capability-binding-ir').CapabilityBindingSupersessionResult> {
    const existing = byId.get(existingBindingId)
    if (existing === undefined) throw new Error(`Binding '${existingBindingId}' not found`)
    if (existing.state === 'superseded' || existing.state === 'invalidated') {
      throw new Error(`Cannot supersede binding '${existingBindingId}' in state '${existing.state}'`)
    }

    // Atomic: both operations with no await between them
    const supersededRecord = makeRecord(
      existing.binding, 'superseded', existing.stateVersion + 1, updatedAt,
      existing.readiness, existing.installations,
    )

    const replacementState = deriveStateFromReadiness(replacementReadiness)
    const replacementRecord = makeRecord(
      replacement, replacementState, 1, updatedAt, replacementReadiness, replacementInstallations,
    )

    byId.set(existingBindingId, supersededRecord)
    byId.set(replacement.bindingId, replacementRecord)
    byHash.set(replacement.bindingHash, replacement.bindingId)

    return { previous: supersededRecord, replacement: replacementRecord }
  }

  return {
    put,
    get,
    getByHash: getByHashImpl,
    getCurrentForRequirement,
    listForSet,
    refreshReadiness,
    invalidate,
    supersede,
  }
}
