import type { RoutingRequest } from './domain/request.js'
import type { ExecutionContext, CancellationToken } from './domain/context.js'
import type { SystemConfig } from './domain/config.js'
import type { RuntimeServices } from './domain/context.js'
import { RUNTIME_MODE_POLICIES } from './domain/mode.js'
import { DefaultDecisionTraceBuilder } from './trace-builder.js'

class SimpleCancellationToken implements CancellationToken {
  private _cancelled = false
  private handlers: Array<() => void> = []

  get isCancelled(): boolean { return this._cancelled }

  cancel(): void {
    this._cancelled = true
    for (const h of this.handlers) h()
  }

  onCancel(fn: () => void): void {
    if (this._cancelled) fn()
    else this.handlers.push(fn)
  }
}

export class ExecutionContextFactory {
  constructor(
    private readonly config: SystemConfig,
    private readonly services: RuntimeServices,
  ) {}

  create(request: RoutingRequest): ExecutionContext {
    const mode = request.constraints.mode
    const basePolicy = RUNTIME_MODE_POLICIES[mode]
    const modePolicy = mode === 'CUSTOM' && this.config.runtime.customModePolicy
      ? this.config.runtime.customModePolicy
      : basePolicy

    return {
      request,
      services: this.services,
      budget: request.constraints,
      modePolicy,
      userContext: request.context,
      traceBuilder: new DefaultDecisionTraceBuilder(request.id),
      cancellationToken: new SimpleCancellationToken(),
    }
  }
}
