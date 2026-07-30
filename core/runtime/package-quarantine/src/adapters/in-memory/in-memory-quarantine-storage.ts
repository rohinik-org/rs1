import type { QuarantineStorage } from '../../ports/quarantine-storage.js'
import type {
  QuarantineNamespace,
  QuarantineNamespaceRequest,
  PackageQuarantineResult,
  ExistingQuarantineOperation,
  QuarantineRecordReceipt,
  StorageReceipt,
} from '../../types.js'

export class InMemoryQuarantineStorage implements QuarantineStorage {
  private readonly operations = new Map<string, ExistingQuarantineOperation>()
  private readonly namespaces = new Map<string, QuarantineNamespace>()

  async resolveNamespace(input: QuarantineNamespaceRequest): Promise<QuarantineNamespace> {
    const prefix = input.tenantId ? `${input.tenantId}/quarantine` : 'quarantine'
    const safePkg = (input.packageId ?? 'unknown').replace(/[/\s..]+/g, '-')
    const safeVer = (input.version ?? 'unknown').replace(/[/\s..]+/g, '-')
    const path = `${prefix}/${safePkg}/${safeVer}/${input.operationId}`
    const namespaceId = `ns-${input.operationId}`
    return { namespaceId, path, activatable: false }
  }

  async createNamespace(namespace: QuarantineNamespace): Promise<StorageReceipt> {
    this.namespaces.set(namespace.namespaceId, namespace)
    return { operation: 'create-namespace', reference: namespace.path, completedAt: 'created' }
  }

  async recordResult(result: PackageQuarantineResult): Promise<QuarantineRecordReceipt> {
    const op: ExistingQuarantineOperation = {
      operationId: result.operationId,
      outcome: result.outcome,
      result,
    }
    this.operations.set(result.operationId, op)
    return { recordId: `rec-${result.operationId}`, operationId: result.operationId }
  }

  async findByOperationId(operationId: string): Promise<ExistingQuarantineOperation | undefined> {
    return this.operations.get(operationId)
  }
}
