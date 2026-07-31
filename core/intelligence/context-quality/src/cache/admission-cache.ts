import { computeContractHash, computePolicyHash } from '@rohinik-org/context-quality-ir'
import type {
  ContextAdmissionResult,
  ContextPackageId,
  ContentHash,
  AdmissionPolicy,
  ContextContract,
  ConsumerContextProfile,
} from '@rohinik-org/context-quality-ir'

interface CacheKey {
  readonly packageHash:   ContentHash
  readonly contractHash:  ContentHash
  readonly policyHash:    ContentHash
  readonly consumerKey:   string
}

interface CacheEntry {
  readonly result: ContextAdmissionResult
  readonly key:    CacheKey
}

function consumerCacheKey(consumer: ConsumerContextProfile): string {
  return [
    consumer.consumerId ?? '',
    consumer.consumerKind,
    consumer.principalId ?? '',
    consumer.tenantId ?? '',
    consumer.residency ?? '',
    consumer.maximumClassification ?? '',
  ].join('|')
}

function buildCacheKey(
  packageHash:  ContentHash,
  contract:     ContextContract,
  policy:       AdmissionPolicy,
  consumer:     ConsumerContextProfile,
): CacheKey {
  return {
    packageHash,
    contractHash:  computeContractHash(contract),
    policyHash:    computePolicyHash(policy),
    consumerKey:   consumerCacheKey(consumer),
  }
}

function keysMatch(a: CacheKey, b: CacheKey): boolean {
  return a.packageHash === b.packageHash
    && a.contractHash === b.contractHash
    && a.policyHash === b.policyHash
    && a.consumerKey === b.consumerKey
}

// Cache admission results. Every hit is revalidated against all four identity axes
// before serving — no stale cache entry can bypass admission.
export class ContextAdmissionCache {
  private readonly entries = new Map<string, CacheEntry>()

  set(
    packageId:    ContextPackageId,
    packageHash:  ContentHash,
    contract:     ContextContract,
    policy:       AdmissionPolicy,
    consumer:     ConsumerContextProfile,
    result:       ContextAdmissionResult,
  ): void {
    const key = buildCacheKey(packageHash, contract, policy, consumer)
    this.entries.set(packageId, { result, key })
  }

  get(
    packageId:   ContextPackageId,
    packageHash: ContentHash,
    contract:    ContextContract,
    policy:      AdmissionPolicy,
    consumer:    ConsumerContextProfile,
  ): ContextAdmissionResult | undefined {
    const entry = this.entries.get(packageId)
    if (!entry) return undefined
    const currentKey = buildCacheKey(packageHash, contract, policy, consumer)
    if (!keysMatch(entry.key, currentKey)) {
      this.entries.delete(packageId)
      return undefined
    }
    return entry.result
  }

  invalidate(packageId: ContextPackageId): void {
    this.entries.delete(packageId)
  }

  size(): number {
    return this.entries.size
  }
}
