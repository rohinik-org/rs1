import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WorkflowPlan, PlanningTrace } from '@rohinik-org/compiler'
import type { PlanStore } from './plan-store.js'

export class JsonPlanStore implements PlanStore {
  constructor(private readonly projectRoot: string) {}

  private get plansDir(): string { return join(this.projectRoot, '.aios', 'plans', 'plans') }
  private get tracesDir(): string { return join(this.projectRoot, '.aios', 'plans', 'traces') }

  async savePlan(plan: WorkflowPlan): Promise<void> {
    await mkdir(this.plansDir, { recursive: true })
    await writeFile(join(this.plansDir, `${plan.planId}.json`), JSON.stringify(plan, null, 2))
  }

  async saveTrace(trace: PlanningTrace): Promise<void> {
    await mkdir(this.tracesDir, { recursive: true })
    await writeFile(join(this.tracesDir, `${trace.traceId}.json`), JSON.stringify(trace, null, 2))
  }

  async loadPlan(planId: string): Promise<WorkflowPlan | undefined> {
    try {
      const raw = await readFile(join(this.plansDir, `${planId}.json`), 'utf-8')
      return JSON.parse(raw) as WorkflowPlan
    } catch {
      return undefined
    }
  }
}
