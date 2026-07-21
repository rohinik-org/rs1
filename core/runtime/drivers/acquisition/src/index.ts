import { randomUUID } from 'node:crypto'
import type { ExecutionDriver, DriverDescriptor, DriverHealth, DriverRequest, DriverRawEvent } from '@rohinik-org/capability-manifest'
import { DriverErrorCode, makeDriverError } from '@rohinik-org/capability-manifest'
import type {
  CapabilityAcquisitionPipeline,
  AcquisitionPolicyIR,
} from '@rohinik-org/capability-acquisition'
import { DEFAULT_ACQUISITION_POLICY } from '@rohinik-org/capability-acquisition'
import type { CapabilityRegistry } from '@rohinik-org/capability-registry'

const DESCRIPTOR: DriverDescriptor = {
  id: 'acquisition',
  version: '0.1.0',
  apiVersion: 1,
  priority: 10,
  tags: ['acquisition', 'install', 'capability'],
  capabilities: {
    supportsStreaming: false,
    supportsCancellation: false,
    supportsProgress: false,
    supportsHealth: true,
    offline: true,
    sandboxed: false,
    trusted: true,
  },
}

export class AcquisitionDriver implements ExecutionDriver {
  readonly descriptor = DESCRIPTOR

  constructor(
    private readonly pipeline: CapabilityAcquisitionPipeline,
    private readonly registry: CapabilityRegistry,
  ) {}

  async *execute(req: DriverRequest): AsyncIterable<DriverRawEvent> {
    yield { type: 'STARTED', payload: {} }
    try {
      const input = req.input as Record<string, unknown>
      const policy = (input.policy as AcquisitionPolicyIR | undefined) ?? DEFAULT_ACQUISITION_POLICY

      if (req.capabilityId === 'acquisition:search') {
        const results = await this.pipeline.search({
          term: String(input.term ?? ''),
          version: input.version as string | undefined,
        })
        yield { type: 'RESULT', payload: { candidates: results } }

      } else if (req.capabilityId === 'acquisition:plan') {
        const candidates = await this.pipeline.search({ term: String(input.term ?? '') })
        if (candidates.length === 0) {
          yield { type: 'RESULT', payload: { plan: null, reason: 'no candidates found' } }
        } else {
          const plan = await this.pipeline.plan(candidates[0], policy)
          yield { type: 'RESULT', payload: { plan } }
        }

      } else if (req.capabilityId === 'acquisition:install') {
        const candidates = await this.pipeline.search({ term: String(input.term ?? '') })
        if (candidates.length === 0) {
          yield { type: 'RESULT', payload: { success: false, reason: 'no candidates found' } }
        } else {
          const plan = await this.pipeline.plan(candidates[0], policy)
          const result = await this.pipeline.install(plan, {
            requestId: randomUUID(),
            term: String(input.term ?? ''),
            policy,
          })
          yield { type: 'RESULT', payload: result }
        }

      } else if (req.capabilityId === 'acquisition:list-installed') {
        yield { type: 'RESULT', payload: { installed: this.registry.list() } }

      } else if (req.capabilityId === 'acquisition:list-sources') {
        // ponytail: sources exposed via pipeline internals — not ideal; expose via RuntimeHost in Stage 10
        yield { type: 'RESULT', payload: { sources: [] } }

      } else {
        yield { type: 'RESULT', payload: { error: `Unknown capability: ${req.capabilityId}` } }
      }
    } catch (err) {
      yield { type: 'ERROR', payload: makeDriverError(DriverErrorCode.EXECUTION_FAILED, err instanceof Error ? err.message : String(err)) }
    }
  }

  async health(): Promise<DriverHealth> {
    return { status: 'healthy', checkedAt: new Date() }
  }

  async shutdown(): Promise<void> {}
}
