import type { KernelRuntime } from '@rohinik-org/kernel'

export interface BuiltinDescriptor {
  readonly id: string
  readonly version: string
  readonly dependencies?: ReadonlyArray<string>
  activate(runtime: KernelRuntime): void | Promise<void>
  deactivate?(runtime: KernelRuntime): void | Promise<void>
  health?(): { status: 'healthy' | 'degraded' | 'unavailable' }
}

export class BuiltinRegistry {
  private readonly descriptors: BuiltinDescriptor[] = []

  register(descriptor: BuiltinDescriptor): void {
    this.descriptors.push(descriptor)
  }

  getAll(): ReadonlyArray<BuiltinDescriptor> {
    return this.descriptors
  }

  validate(): void {
    const ids = new Set(this.descriptors.map(d => d.id))
    for (const descriptor of this.descriptors) {
      for (const dep of descriptor.dependencies ?? []) {
        if (!ids.has(dep)) {
          throw new Error(`Builtin '${descriptor.id}' declares dependency '${dep}' which is not registered`)
        }
      }
    }
  }
}
