import { rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export class StagingCleaner {
  constructor(private readonly stagingRoot: string) {}

  async removeStaging(stagingId: string): Promise<void> {
    await rm(join(this.stagingRoot, stagingId), { recursive: true, force: true })
  }

  // Removes all staging directories — used for full cleanup / test teardown
  async removeAll(): Promise<void> {
    const entries = await readdir(this.stagingRoot).catch(() => [])
    await Promise.all(entries.map(e => rm(join(this.stagingRoot, e), { recursive: true, force: true })))
  }
}
