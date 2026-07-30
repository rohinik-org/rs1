import type { ArtifactStorageStat, ArtifactIdentityReceipt, StorageReceipt } from '../types.js'

export interface ArtifactStorage {
  stat(reference: string): Promise<ArtifactStorageStat>
  seal(reference: string): Promise<StorageReceipt>
  copy(source: string, destination: string): Promise<StorageReceipt>
  move(source: string, destination: string): Promise<StorageReceipt>
  removeActivationReference(reference: string): Promise<StorageReceipt>
  verifyIdentity(reference: string): Promise<ArtifactIdentityReceipt>
}
