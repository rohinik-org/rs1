import type {
  ExecutionDriver,
  DriverDescriptor,
  DriverHealth,
  DriverRequest,
  DriverRawEvent,
} from '@rohinik-org/capability-manifest'
import { makeDriverError } from '@rohinik-org/capability-manifest'
import type { KnowledgeService, ProcedureFilter, EntityFilter } from '@rohinik-org/knowledge'

const DESCRIPTOR: DriverDescriptor = {
  id: 'knowledge',
  version: '0.1.0',
  apiVersion: 1,
  priority: 10,
  tags: ['knowledge', 'semantic', 'extraction'],
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

export class KnowledgeDriver implements ExecutionDriver {
  readonly descriptor = DESCRIPTOR

  constructor(private readonly knowledge: KnowledgeService) {}

  async *execute(request: DriverRequest): AsyncIterable<DriverRawEvent> {
    yield { type: 'STARTED', payload: {} }

    try {
      const input = request.input as Record<string, unknown>

      switch (request.capabilityId) {
        case 'knowledge:extract': {
          const fragment = await this.knowledge.extract(
            String(input.path ?? ''),
            String(input.content ?? ''),
          )
          yield { type: 'RESULT', payload: fragment }
          break
        }
        case 'knowledge:query': {
          const result = await this.knowledge.query({
            primitive: input.primitive as never,
            kind: input.kind as never,
            label: input.label as string | undefined,
          })
          yield { type: 'RESULT', payload: result }
          break
        }
        case 'knowledge:find-procedures': {
          const procs = await this.knowledge.findProcedures(input as ProcedureFilter | undefined)
          yield { type: 'RESULT', payload: { procedures: procs } }
          break
        }
        case 'knowledge:find-entities': {
          const entities = await this.knowledge.findEntities(input as EntityFilter | undefined)
          yield { type: 'RESULT', payload: { entities } }
          break
        }
        case 'workflow:discover': {
          // ponytail: WorkflowDiscoveryEngine integration deferred; stub returns empty
          yield { type: 'RESULT', payload: { candidates: [] } }
          break
        }
        case 'procedure:classify': {
          const candidates = await this.knowledge.classify(
            input.fragment as Parameters<typeof this.knowledge.classify>[0]
          )
          yield { type: 'RESULT', payload: { candidates } }
          break
        }
        default:
          yield { type: 'ERROR', payload: makeDriverError('CAPABILITY_NOT_FOUND', `Unknown: ${request.capabilityId}`) }
      }
    } catch (err) {
      yield { type: 'ERROR', payload: makeDriverError('EXECUTION_FAILED', String(err)) }
    }

    yield { type: 'COMPLETE', payload: {} }
  }

  async health(): Promise<DriverHealth> {
    return { status: 'healthy', checkedAt: new Date() }
  }

  async shutdown(): Promise<void> {}
}
