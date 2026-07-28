import type { AuthorizationId, AuthorizationIssuerId, AuthorizedPlanSemanticHash } from '@rohinik-org/provisioning-ir'

export interface InProcessAuthorizationRecord {
  readonly token: string
  readonly issuer: AuthorizationIssuerId
  readonly authorizationId: AuthorizationId
  readonly signedPayloadHash: AuthorizedPlanSemanticHash
}

export class AuthorizationProofStore {
  private readonly records = new Map<string, InProcessAuthorizationRecord>()

  register(record: InProcessAuthorizationRecord): void {
    if (this.records.has(record.token)) {
      throw new Error(`AuthorizationProofStore: duplicate token registration`)
    }
    this.records.set(record.token, record)
  }

  get(token: string): InProcessAuthorizationRecord | undefined {
    return this.records.get(token)
  }

  // ponytail: single-use consumption for managed execution; upgrade to per-token TTL if replay attacks matter
  consume(token: string): InProcessAuthorizationRecord | undefined {
    const record = this.records.get(token)
    if (record) this.records.delete(token)
    return record
  }
}
