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
  readonly packageHash:      ContentHash
  readonly contractHash:     ContentHash
  readonly policyHash:       ContentHash
  readonly consumerKey:      string
  readonly evaluatorSetHash: string
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
  packageHash:      ContentHash,
  contract:         ContextContract,
  policy:           AdmissionPolicy,
  consumer:         ConsumerContextProfile,
  evaluatorSetHash: string,
): CacheKey {
  return {
    packageHash,
    contractHash:  computeContractHash(contract),
    policyHash:    computePolicyHash(policy),
    consumerKey:   consumerCacheKey(consumer),
    evaluatorSetHash,
  }
}

function keysMatch(a: CacheKey, b: CacheKey): boolean {
  return a.packageHash === b.packageHash
    && a.contractHash === b.contractHash
    && a.policyHash === b.policyHash
    && a.consumerKey === b.consumerKey
    && a.evaluatorSetHash === b.evaluatorSetHash
}

// Cache admission results. Every hit is revalidated against all five identity axes
// (package, contract, policy, consumer, evaluator-set) before serving.
export class ContextAdmissionCache {
  private readonly entries = new Map<string, CacheEntry>()

  set(
    packageId:        ContextPackageId,
    packageHash:      ContentHash,
    contract:         ContextContract,
    policy:           AdmissionPolicy,
    consumer:         ConsumerContextProfile,
    evaluatorSetHash: string,
    result:           ContextAdmissionResult,
  ): void {
    const key = buildCacheKey(packageHash, contract, policy, consumer, evaluatorSetHash)
    this.entries.set(packageId, { result, key })
  }

  get(
    packageId:        ContextPackageId,
    packageHash:      ContentHash,
    contract:         ContextContract,
    policy:           AdmissionPolicy,
    consumer:         ConsumerContextProfile,
    evaluatorSetHash: string,
  ): ContextAdmissionResult | undefined {
    const entry = this.entries.get(packageId)
    if (!entry) return undefined
    const currentKey = buildCacheKey(packageHash, contract, policy, consumer, evaluatorSetHash)
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
