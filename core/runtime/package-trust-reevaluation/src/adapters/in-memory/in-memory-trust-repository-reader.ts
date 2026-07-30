import type { PackageTrustDecisionRecord, RepositoryPage } from '@rohinik-org/package-trust-repository'
import type { PackageTrustSubject } from '@rohinik-org/package-trust-ir'
import type { TrustRepositoryReader } from '../../ports/trust-repository-reader.js'
import type {
  ReevaluationCandidateQuery,
  PackageTrustReevaluationCandidate,
  PackageQuarantineState,
} from '../../types.js'

export class InMemoryTrustRepositoryReader implements TrustRepositoryReader {
  private readonly records = new Map<string, PackageTrustDecisionRecord>()
  private readonly candidates: PackageTrustReevaluationCandidate[] = []
  private readonly quarantineStates = new Map<string, PackageQuarantineState>()

  addRecord(record: PackageTrustDecisionRecord): void {
    this.records.set(record.recordId, record)
  }

  addCandidate(candidate: PackageTrustReevaluationCandidate): void {
    this.candidates.push(candidate)
  }

  setQuarantineState(subjectKey: string, state: PackageQuarantineState): void {
    this.quarantineStates.set(subjectKey, state)
  }

  // ponytail: throws to distinguish query failure from no-candidates (L-9J-1228)
  simulateFailure = false

  async findReevaluationCandidates(query: ReevaluationCandidateQuery): Promise<RepositoryPage<PackageTrustReevaluationCandidate>> {
    if (this.simulateFailure) throw new Error('repository-unavailable')
    let items = this.candidates.slice()
    if (query.packageIds?.length) {
      items = items.filter(c => query.packageIds!.includes(c.subject.packageId))
    }
    const offset = query.cursor ? Number(query.cursor) : 0
    const page = items.slice(offset, offset + query.limit)
    const nextOffset = offset + query.limit
    const result: import('@rohinik-org/package-trust-repository').RepositoryPage<PackageTrustReevaluationCandidate> = { items: page, total: items.length }
    if (nextOffset < items.length) {
      return { ...result, nextCursor: String(nextOffset) as import('@rohinik-org/package-trust-repository').CursorToken }
    }
    return result
  }

  async getTrustDecisionRecord(recordId: string): Promise<PackageTrustDecisionRecord | undefined> {
    return this.records.get(recordId)
  }

  async getCurrentQuarantineState(subject: PackageTrustSubject): Promise<PackageQuarantineState> {
    const key = `${subject.packageId}@${subject.version}`
    return this.quarantineStates.get(key) ?? { isQuarantined: false }
  }
}
