import {
  ContextPackageLifecycle,
  assertLifecycleTransition,
  isValidLifecycleTransition,
} from '@rohinik-org/context-quality-ir'
import type { ContextPackageId } from '@rohinik-org/context-quality-ir'

export interface LifecycleRecord {
  readonly packageId: ContextPackageId
  readonly state:     ContextPackageLifecycle
  readonly updatedAt: Date
}

export class PackageLifecycleMachine {
  private readonly states = new Map<string, ContextPackageLifecycle>()

  initialize(packageId: ContextPackageId): LifecycleRecord {
    if (this.states.has(packageId)) {
      throw new Error(`Package '${packageId}' already initialized`)
    }
    this.states.set(packageId, ContextPackageLifecycle.DRAFT)
    return { packageId, state: ContextPackageLifecycle.DRAFT, updatedAt: new Date() }
  }

  transition(packageId: ContextPackageId, to: ContextPackageLifecycle, clock?: { now(): Date }): LifecycleRecord {
    const current = this.states.get(packageId)
    if (current === undefined) {
      throw new Error(`Package '${packageId}' not found in lifecycle machine`)
    }
    assertLifecycleTransition(current, to)
    this.states.set(packageId, to)
    return { packageId, state: to, updatedAt: clock ? clock.now() : new Date() }
  }

  current(packageId: ContextPackageId): ContextPackageLifecycle | undefined {
    return this.states.get(packageId)
  }

  canTransition(packageId: ContextPackageId, to: ContextPackageLifecycle): boolean {
    const current = this.states.get(packageId)
    return current !== undefined && isValidLifecycleTransition(current, to)
  }
}
