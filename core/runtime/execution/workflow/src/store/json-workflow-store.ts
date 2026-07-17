import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { WorkflowDescriptor, WorkflowCandidateSet, WorkflowApproval } from '@rohinik-org/compiler'
import type { WorkflowStore } from './workflow-store.js'

export class JsonWorkflowStore implements WorkflowStore {
  constructor(private readonly root: string) {}

  private dir(sub: string): string {
    return join(this.root, '.aios', 'workflows', sub)
  }

  async save(descriptor: WorkflowDescriptor): Promise<void> {
    await mkdir(this.dir('descriptors'), { recursive: true })
    await writeFile(
      join(this.dir('descriptors'), `${descriptor.workflowId}.json`),
      JSON.stringify(descriptor, null, 2),
      'utf-8',
    )
  }

  async saveCandidateSet(set: WorkflowCandidateSet): Promise<void> {
    await mkdir(this.dir('candidates'), { recursive: true })
    await writeFile(
      join(this.dir('candidates'), `${set.candidateSetId}.json`),
      JSON.stringify(set, null, 2),
      'utf-8',
    )
  }

  async saveApproval(approval: WorkflowApproval): Promise<void> {
    await mkdir(this.dir('approvals'), { recursive: true })
    await writeFile(
      join(this.dir('approvals'), `${approval.approvalId}.json`),
      JSON.stringify(approval, null, 2),
      'utf-8',
    )
  }

  async list(): Promise<readonly WorkflowDescriptor[]> {
    const dir = this.dir('descriptors')
    if (!existsSync(dir)) return []
    const files = (await readdir(dir)).filter(f => f.endsWith('.json'))
    return Promise.all(
      files.map(async f => JSON.parse(await readFile(join(dir, f), 'utf-8')) as WorkflowDescriptor),
    )
  }

  async findBySkill(skillId: string): Promise<readonly WorkflowDescriptor[]> {
    const all = await this.list()
    return all.filter(wf => wf.definition.steps.some(s => s.skillId === skillId))
  }
}
