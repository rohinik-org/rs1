import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ExecutionResult, ExecutionCheckpoint } from '@rohinik-org/compiler'
import type { ExecutionStore } from './execution-store.js'

export class JsonExecutionStore implements ExecutionStore {
  constructor(private readonly projectRoot: string) {}

  private get resultsDir(): string { return join(this.projectRoot, '.aios', 'executions', 'results') }
  private get checkpointsDir(): string { return join(this.projectRoot, '.aios', 'executions', 'checkpoints') }

  async saveResult(result: ExecutionResult): Promise<void> {
    await mkdir(this.resultsDir, { recursive: true })
    await writeFile(join(this.resultsDir, `${result.executionId}.json`), JSON.stringify(result, null, 2))
  }

  async loadResult(executionId: string): Promise<ExecutionResult | undefined> {
    try {
      return JSON.parse(await readFile(join(this.resultsDir, `${executionId}.json`), 'utf-8')) as ExecutionResult
    } catch { return undefined }
  }

  async saveCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void> {
    await mkdir(this.checkpointsDir, { recursive: true })
    await writeFile(join(this.checkpointsDir, `${checkpoint.executionId}.json`), JSON.stringify(checkpoint, null, 2))
  }

  async loadCheckpoint(executionId: string): Promise<ExecutionCheckpoint | undefined> {
    try {
      return JSON.parse(await readFile(join(this.checkpointsDir, `${executionId}.json`), 'utf-8')) as ExecutionCheckpoint
    } catch { return undefined }
  }
}
