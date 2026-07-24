import type {
  CapabilityBindingRepository,
  CapabilityBinding,
  CapabilityBindingId,
  CapabilityBindingPutResult,
  CapabilityBindingInvalidationReason,
} from '@rohinik-org/capability-binding-ir'
import type { CapabilityRequirementId, CapabilityRequirementSetId } from '@rohinik-org/capability-contracts-ir'
import { deepFreeze } from './deep-freeze.js'

export function createInMemoryCapabilityBindingRepository(): CapabilityBindingRepository {
  const store = new Map<CapabilityBindingId, CapabilityBinding>()

  async function put(binding: CapabilityBinding): Promise<CapabilityBindingPutResult> {
    const existing = store.get(binding.bindingId)
    if (existing !== undefined) {
      if (existing.bindingHash === binding.bindingHash) {
        return { status: 'already-exists-identical', binding: existing }
      }
      return { status: 'collision', bindingId: binding.bindingId }
    }
    store.set(binding.bindingId, binding)
    return { status: 'accepted', binding }
  }

  async function get(bindingId: CapabilityBindingId): Promise<CapabilityBinding | undefined> {
    return store.get(bindingId)
  }

  async function getCurrentForRequirement(
    requirementId: CapabilityRequirementId,
  ): Promise<CapabilityBinding | undefined> {
    const active: CapabilityBinding[] = []
    for (const b of store.values()) {
      if (b.requirementId === requirementId && b.state !== 'superseded' && b.state !== 'invalidated') {
        active.push(b)
      }
    }
    if (active.length === 0) return undefined
    // Return most recently created
    return active.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  }

  async function listForSet(setId: CapabilityRequirementSetId): Promise<readonly CapabilityBinding[]> {
    return Array.from(store.values()).filter(b => b.setId === setId)
  }

  async function invalidate(
    bindingId: CapabilityBindingId,
    _reason: CapabilityBindingInvalidationReason,
  ): Promise<CapabilityBinding> {
    const existing = store.get(bindingId)
    if (existing === undefined) {
      throw new Error(`Binding '${bindingId}' not found`)
    }
    const invalidated = deepFreeze({ ...existing, state: 'invalidated' as const })
    store.set(bindingId, invalidated)
    return invalidated
  }

  return { put, get, getCurrentForRequirement, listForSet, invalidate }
}
