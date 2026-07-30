import type { PackageQuarantineRequest, PackageQuarantineResult } from '@rohinik-org/package-quarantine'

export interface QuarantineService {
  quarantine(request: PackageQuarantineRequest): Promise<PackageQuarantineResult>
}
