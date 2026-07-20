import { randomUUID } from 'node:crypto'
import type { DriverEvent, ExecutionContext, DriverRequest } from '@rohinik-org/capability-manifest'
import { DriverErrorCode, makeDriverError, DriverProtocolValidator, MetadataEnricher } from '@rohinik-org/capability-manifest'
import type { DriverRegistry } from '../kernel/driver-registry.js'
import type { CapabilityDriverRegistry } from '../kernel/capability-driver-registry.js'

export class ExecutionDispatcher {
  private readonly enricher = new MetadataEnricher()

  constructor(
    private readonly driverReg: DriverRegistry,
    private readonly capabilityReg: CapabilityDriverRegistry
  ) {}

  dispatch<T>(capabilityId: string, input: unknown, context: ExecutionContext): AsyncIterable<DriverEvent<T>> {
    const resolved = this.capabilityReg.resolve(capabilityId)
    if (!resolved) {
      return errorStream<T>(makeDriverError(DriverErrorCode.CAPABILITY_NOT_FOUND, `Capability not found: ${capabilityId}`))
    }

    const binding = this.driverReg.findById(resolved.driverRef)
    if (!binding) {
      return errorStream<T>(makeDriverError(DriverErrorCode.DRIVER_NOT_FOUND, `Driver not found: ${resolved.driverRef}`))
    }

    if (context.signal?.aborted) {
      return errorStream<T>(makeDriverError(DriverErrorCode.CANCELLED, 'Execution cancelled before start'))
    }

    const request: DriverRequest = { capabilityId, input, context }
    const raw = binding.driver.execute(request)
    const validated = DriverProtocolValidator.validate(raw)
    return this.enricher.enrich(validated, context, binding.descriptor.id) as AsyncIterable<DriverEvent<T>>
  }
}

async function* errorStream<T>(error: ReturnType<typeof makeDriverError>): AsyncIterable<DriverEvent<T>> {
  const base = {
    requestId: '',
    executionId: '',
    driverId: '',
    sequence: 1,
    timestamp: new Date(),
  }
  yield { ...base, type: 'ERROR', payload: error } as DriverEvent<T>
}
