import type { ExecutionRecord } from '@rohinik-org/compiler'

export interface CorpusStorage {
  write(record: ExecutionRecord): Promise<void>
  read(recordId: string): Promise<ExecutionRecord | null>
  readRange(dateStart: string, dateEnd: string): AsyncIterable<ExecutionRecord>
  // v1: no-op — future storage engines (SQLite, DuckDB) may implement compaction
  compact(beforeDate: string): Promise<number>
  // v1: no-op — future storage engines may implement archival to cold storage
  archive(beforeDate: string, destination: string): Promise<number>
  close(): Promise<void>
}
