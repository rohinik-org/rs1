import { createHash } from 'node:crypto'
import { canonicalize } from './canonical-record-serializer.js'

export function computeRecordDigest(
  schemaVersion: string,
  recordType: string,
  record: unknown,
  previousRecordDigest?: string,
): string {
  const payload = {
    schemaVersion,
    recordType,
    record: JSON.parse(canonicalize(record)),
    ...(previousRecordDigest !== undefined && { previousRecordDigest }),
  }
  const canonical = canonicalize(payload)
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}
