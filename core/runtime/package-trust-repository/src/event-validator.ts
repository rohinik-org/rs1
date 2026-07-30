import { RepositoryWriteConflict } from './types.js'
import type { PackageTrustEventRecord } from './types.js'

const PROHIBITED_KEYS = new Set(['password', 'secret', 'privateKey', 'credentials', 'token', 'apiKey', 'packageBytes', 'executableContent'])
const MAX_PAYLOAD_BYTES = 65536

export function validateEventRecord(record: PackageTrustEventRecord): void {
  if (!record.eventType) {
    throw new RepositoryWriteConflict('command-validation-failure', 'Missing eventType')
  }
  if (!record.subject?.packageId) {
    throw new RepositoryWriteConflict('command-validation-failure', 'Event missing subject.packageId')
  }
  const payloadSize = JSON.stringify(record.payload).length
  if (payloadSize > MAX_PAYLOAD_BYTES) {
    throw new RepositoryWriteConflict('payload-too-large', `Event payload too large: ${payloadSize} bytes`)
  }
  for (const key of Object.keys(record.payload)) {
    if (PROHIBITED_KEYS.has(key)) {
      throw new RepositoryWriteConflict('secret-field-rejected', `Prohibited field in event payload: ${key}`)
    }
  }
}
