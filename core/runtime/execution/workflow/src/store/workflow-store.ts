import type { WorkflowDescriptor, WorkflowCandidateSet, WorkflowApproval } from '@rohinik-org/compiler'

export interface WorkflowStore {
  save(descriptor: WorkflowDescriptor): Promise<void>
  saveCandidateSet(set: WorkflowCandidateSet): Promise<void>
  saveApproval(approval: WorkflowApproval): Promise<void>
  list(): Promise<readonly WorkflowDescriptor[]>
  findBySkill(skillId: string): Promise<readonly WorkflowDescriptor[]>
}
