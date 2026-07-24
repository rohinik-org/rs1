import { Builder } from './builder.js'
import { RequirementSubmissionErrorCode as SEC } from '@rohinik-org/capability-contracts-ir'
import type {
  IdGenerator,
  Clock,
  CapabilityRequirementRepository,
  CapabilityRequirementSetDraft,
  CapabilityRequirementSubmissionResult,
  CapabilityRequirementSet,
  CapabilityRequirementSetId,
  CapabilityRequirementSetHash,
  SubmissionError,
} from '@rohinik-org/capability-contracts-ir'

interface StoredRecord {
  readonly set: CapabilityRequirementSet
  readonly semanticHash: CapabilityRequirementSetHash
}

class InMemoryRepository implements CapabilityRequirementRepository {
  private readonly builder: Builder
  private readonly store = new Map<string, StoredRecord>()

  constructor(idGenerator: IdGenerator, clock: Clock) {
    this.builder = new Builder(idGenerator, clock)
  }

  async submit(draft: CapabilityRequirementSetDraft): Promise<CapabilityRequirementSubmissionResult> {
    const prep = this.builder.prepare(draft)
    if (prep.status === 'invalid') {
      return { status: 'rejected', validation: prep.validation, submissionErrors: [] }
    }

    const suppliedSetId = prep.suppliedSetId
    if (suppliedSetId !== undefined) {
      const existing = this.store.get(suppliedSetId)
      if (existing !== undefined) {
        if (existing.semanticHash === prep.semanticHash) {
          return {
            status: 'already-exists-identical',
            validation: prep.validation,
            submissionErrors: [],
            setId: suppliedSetId,
            semanticHash: prep.semanticHash,
          }
        }
        const err: SubmissionError = {
          code: SEC.REQUIREMENT_SET_ID_COLLISION,
          message: `setId ${suppliedSetId} exists with a different semanticHash`,
        }
        return {
          status: 'rejected',
          validation: prep.validation,
          submissionErrors: [err],
          setId: suppliedSetId,
          semanticHash: prep.semanticHash,
        }
      }
    }

    const { interned } = this.builder.materialize(prep.prepared, suppliedSetId !== undefined ? { setId: suppliedSetId } : undefined)
    this.store.set(interned.set.setId, { set: interned.set, semanticHash: interned.envelopeIdentity.semanticHash })
    return {
      status: 'accepted',
      validation: prep.validation,
      submissionErrors: [],
      setId: interned.set.setId,
      semanticHash: interned.envelopeIdentity.semanticHash,
    }
  }

  async get(setId: CapabilityRequirementSetId): Promise<CapabilityRequirementSet | undefined> {
    return this.store.get(setId)?.set
  }
}

export function createInMemoryCapabilityRequirementRepository(deps: { idGenerator: IdGenerator; clock: Clock }): CapabilityRequirementRepository {
  return new InMemoryRepository(deps.idGenerator, deps.clock)
}
