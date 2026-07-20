import { readFile, writeFile, appendFile, unlink, readdir, mkdir, rm, copyFile, rename, stat, access } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import type {
  ExecutionDriver,
  DriverDescriptor,
  DriverHealth,
  DriverRequest,
  DriverRawEvent,
} from '@rohinik-org/capability-manifest'
import { DriverErrorCode, makeDriverError, RUNTIME_API_VERSION } from '@rohinik-org/capability-manifest'

export const FILESYSTEM_CAPABILITY_IDS = [
  'filesystem:read-file',
  'filesystem:write-file',
  'filesystem:append-file',
  'filesystem:delete-file',
  'filesystem:list-directory',
  'filesystem:create-directory',
  'filesystem:delete-directory',
  'filesystem:file-exists',
  'filesystem:copy',
  'filesystem:move',
  'filesystem:watch', // reserved — NOT_IMPLEMENTED
] as const

const DESCRIPTOR: DriverDescriptor = {
  id: 'filesystem',
  version: '0.1.0',
  apiVersion: RUNTIME_API_VERSION,
  priority: 10,
  tags: ['filesystem', 'local', 'io'],
  capabilities: {
    supportsStreaming: false,
    supportsCancellation: true,
    supportsProgress: true,
    supportsHealth: true,
    offline: true,
    sandboxed: false,
    trusted: true,
  },
}

export class FilesystemDriver implements ExecutionDriver {
  readonly descriptor = DESCRIPTOR

  async *execute(request: DriverRequest): AsyncIterable<DriverRawEvent> {
    const { capabilityId, input, context } = request
    const inp = input as Record<string, string>

    if (context.signal?.aborted) {
      yield { type: 'ERROR', payload: makeDriverError(DriverErrorCode.CANCELLED, 'Cancelled') }
      return
    }

    yield { type: 'STARTED', payload: {} }

    try {
      switch (capabilityId) {
        case 'filesystem:read-file': {
          const data = await readFile(inp.path!, 'utf8')
          yield { type: 'RESULT', payload: data }
          break
        }
        case 'filesystem:write-file': {
          await writeFile(inp.path!, inp.content ?? '', 'utf8')
          yield { type: 'RESULT', payload: { written: true } }
          break
        }
        case 'filesystem:append-file': {
          await appendFile(inp.path!, inp.content ?? '', 'utf8')
          yield { type: 'RESULT', payload: { appended: true } }
          break
        }
        case 'filesystem:delete-file': {
          await unlink(inp.path!)
          yield { type: 'RESULT', payload: { deleted: true } }
          break
        }
        case 'filesystem:list-directory': {
          const entries = await readdir(inp.path!, { withFileTypes: true })
          yield {
            type: 'RESULT',
            payload: entries.map(e => ({ name: e.name, isDirectory: e.isDirectory(), isFile: e.isFile() })),
          }
          break
        }
        case 'filesystem:create-directory': {
          await mkdir(inp.path!, { recursive: true })
          yield { type: 'RESULT', payload: { created: true } }
          break
        }
        case 'filesystem:delete-directory': {
          await rm(inp.path!, { recursive: true, force: true })
          yield { type: 'RESULT', payload: { deleted: true } }
          break
        }
        case 'filesystem:file-exists': {
          let exists = true
          try { await access(inp.path!) } catch { exists = false }
          yield { type: 'RESULT', payload: exists }
          break
        }
        case 'filesystem:copy': {
          if (context.signal?.aborted) {
            yield { type: 'ERROR', payload: makeDriverError(DriverErrorCode.CANCELLED, 'Cancelled') }
            return
          }
          yield { type: 'PROGRESS', payload: { percent: 0, message: 'Starting copy' } }
          await copyFile(inp.src!, inp.dest!)
          yield { type: 'PROGRESS', payload: { percent: 100, message: 'Copy complete' } }
          yield { type: 'RESULT', payload: { copied: true } }
          break
        }
        case 'filesystem:move': {
          yield { type: 'PROGRESS', payload: { percent: 0 } }
          await rename(inp.src!, inp.dest!)
          yield { type: 'PROGRESS', payload: { percent: 100 } }
          yield { type: 'RESULT', payload: { moved: true } }
          break
        }
        case 'filesystem:watch': {
          yield {
            type: 'ERROR',
            payload: makeDriverError(DriverErrorCode.NOT_IMPLEMENTED, 'filesystem:watch is reserved for Stage 9C'),
          }
          return
        }
        default: {
          yield {
            type: 'ERROR',
            payload: makeDriverError(DriverErrorCode.CAPABILITY_NOT_FOUND, `Unknown capability: ${capabilityId}`),
          }
          return
        }
      }
    } catch (err) {
      if (context.signal?.aborted) {
        yield { type: 'ERROR', payload: makeDriverError(DriverErrorCode.CANCELLED, 'Cancelled') }
        return
      }
      yield {
        type: 'ERROR',
        payload: makeDriverError(DriverErrorCode.EXECUTION_FAILED, (err as Error).message, { cause: err }),
      }
      return
    }

    yield { type: 'COMPLETE', payload: {} }
  }

  async health(): Promise<DriverHealth> {
    return { status: 'healthy', checkedAt: new Date() }
  }

  async shutdown(): Promise<void> {}
}
