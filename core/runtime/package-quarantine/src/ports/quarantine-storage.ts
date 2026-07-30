import type {
  QuarantineNamespace,
  QuarantineNamespaceRequest,
  PackageQuarantineResult,
  ExistingQuarantineOperation,
  QuarantineRecordReceipt,
  StorageReceipt,
} from '../types.js'

export interface QuarantineStorage {
  resolveNamespace(input: QuarantineNamespaceRequest): Promise<QuarantineNamespace>
  createNamespace(namespace: QuarantineNamespace): Promise<StorageReceipt>
  recordResult(result: PackageQuarantineResult): Promise<QuarantineRecordReceipt>
  findByOperationId(operationId: string): Promise<ExistingQuarantineOperation | undefined>
}
