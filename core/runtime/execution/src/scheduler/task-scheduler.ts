import type { ExecutionPlan, ExecutionStep } from '@rohinik-org/execution-ir'

export class TaskScheduler {
  // Topological sort via Kahn's algorithm — ephemeral DAG, never stored (Law 49)
  schedule(plan: ExecutionPlan): ReadonlyArray<ExecutionStep> {
    const steps = plan.steps
    if (steps.length === 0) return Object.freeze([])

    const idToStep = new Map<string, ExecutionStep>()
    const inDegree = new Map<string, number>()
    const dependents = new Map<string, string[]>()

    for (const step of steps) {
      idToStep.set(step.stepId, step)
      inDegree.set(step.stepId, 0)
      dependents.set(step.stepId, [])
    }

    for (const step of steps) {
      for (const dep of step.dependsOn) {
        if (!idToStep.has(dep)) {
          throw new Error(`Step "${step.stepId}" depends on unknown step "${dep}"`)
        }
        inDegree.set(step.stepId, (inDegree.get(step.stepId) ?? 0) + 1)
        dependents.get(dep)!.push(step.stepId)
      }
    }

    const queue: string[] = []
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id)
    }
    // Stable order within same in-degree: sort by stepId for determinism (Law 48)
    queue.sort()

    const ordered: ExecutionStep[] = []
    while (queue.length > 0) {
      const id = queue.shift()!
      ordered.push(idToStep.get(id)!)
      const ready: string[] = []
      for (const dep of dependents.get(id)!) {
        const newDeg = (inDegree.get(dep) ?? 0) - 1
        inDegree.set(dep, newDeg)
        if (newDeg === 0) ready.push(dep)
      }
      ready.sort()
      queue.push(...ready)
    }

    if (ordered.length !== steps.length) {
      throw new Error('Cycle detected in ExecutionPlan.steps[].dependsOn (Law 49)')
    }

    return Object.freeze(ordered)
  }
}
