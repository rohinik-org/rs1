import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { InferenceSet, InferencePromotion } from '@rohinik-org/compiler'

export class InferenceStore {
  constructor(private readonly root: string) {}

  private dir(): string { return join(this.root, '.aios', 'inferences') }

  async writeSet(set: InferenceSet): Promise<void> {
    await mkdir(this.dir(), { recursive: true })
    await writeFile(
      join(this.dir(), `${set.inferenceSetId}.json`),
      JSON.stringify(set, null, 2),
      'utf-8',
    )
  }

  async writePromotion(promotion: InferencePromotion): Promise<void> {
    await mkdir(this.dir(), { recursive: true })
    await writeFile(
      join(this.dir(), `${promotion.promotionId}-promotion.json`),
      JSON.stringify(promotion, null, 2),
      'utf-8',
    )
  }
}
