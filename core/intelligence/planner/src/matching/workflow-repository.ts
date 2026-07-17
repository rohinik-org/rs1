import type { WorkflowDescriptor } from '@rohinik-org/compiler'

export interface WorkflowRepository {
  findAll(): Promise<readonly WorkflowDescriptor[]>
  findBySkill(skillId: string): Promise<readonly WorkflowDescriptor[]>
  findById(workflowId: string): Promise<WorkflowDescriptor | undefined>
}
