import type {
  PackageTrustDecisionRecord,
  RepositoryPage,
} from '@rohinik-org/package-trust-repository'
import type { PackageTrustSubject } from '@rohinik-org/package-trust-ir'
import type { ReevaluationCandidateQuery, PackageTrustReevaluationCandidate, PackageQuarantineState } from '../types.js'

export interface TrustRepositoryReader {
  findReevaluationCandidates(query: ReevaluationCandidateQuery): Promise<RepositoryPage<PackageTrustReevaluationCandidate>>
  getTrustDecisionRecord(recordId: string): Promise<PackageTrustDecisionRecord | undefined>
  getCurrentQuarantineState(subject: PackageTrustSubject): Promise<PackageQuarantineState>
}
