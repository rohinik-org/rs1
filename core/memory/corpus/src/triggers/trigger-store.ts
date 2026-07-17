import { mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { LearningTrigger } from '@rohinik-org/compiler'

export class TriggerStore {
  private readonly dir: string

  constructor(root: string) {
    this.dir = join(root, 'triggers')
  }

  async write(trigger: LearningTrigger): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    await writeFile(
      join(this.dir, `${trigger.triggerId}.json`),
      JSON.stringify(trigger, null, 2),
      'utf-8',
    )
  }

  async readAll(): Promise<LearningTrigger[]> {
    if (!existsSync(this.dir)) return []
    const files = await readdir(this.dir).catch(() => [] as string[])
    const triggers: LearningTrigger[] = []
    for (const file of files.filter(f => f.endsWith('.json'))) {
      const raw = await readFile(join(this.dir, file), 'utf-8').catch(() => null)
      if (raw) triggers.push(JSON.parse(raw) as LearningTrigger)
    }
    return triggers
  }

  async delete(triggerId: string): Promise<void> {
    const file = join(this.dir, `${triggerId}.json`)
    await rm(file, { force: true })
  }
}
