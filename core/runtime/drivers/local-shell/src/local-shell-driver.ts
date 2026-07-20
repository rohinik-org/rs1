import { spawn } from 'node:child_process'
import { platform } from 'node:os'
import type {
  ExecutionDriver,
  DriverDescriptor,
  DriverHealth,
  DriverRequest,
  DriverRawEvent,
} from '@rohinik-org/capability-manifest'
import { DriverErrorCode, makeDriverError, RUNTIME_API_VERSION } from '@rohinik-org/capability-manifest'

export const LOCAL_SHELL_CAPABILITY_IDS = [
  'shell:execute',
  'shell:execute-stream',
  'shell:current-directory',
  'shell:change-directory',
  'shell:environment-get',
  'shell:environment-set',
  'shell:terminal', // reserved — NOT_IMPLEMENTED
] as const

const DESCRIPTOR: DriverDescriptor = {
  id: 'local-shell',
  version: '0.1.0',
  apiVersion: RUNTIME_API_VERSION,
  priority: 10,
  tags: ['shell', 'local', 'process'],
  capabilities: {
    supportsStreaming: true,
    supportsCancellation: true,
    supportsProgress: false,
    supportsHealth: true,
    offline: true,
    sandboxed: false,
    trusted: true,
  },
}

let _cwd = process.cwd()
const _env: Record<string, string> = {}

function shellArgs(cmd: string): { shell: string; args: string[] } {
  if (platform() === 'win32') return { shell: 'cmd.exe', args: ['/c', cmd] }
  return { shell: '/bin/sh', args: ['-c', cmd] }
}

export class LocalShellDriver implements ExecutionDriver {
  readonly descriptor = DESCRIPTOR

  async *execute(request: DriverRequest): AsyncIterable<DriverRawEvent> {
    const { capabilityId, input, context } = request
    const inp = input as Record<string, string>

    if (context.signal?.aborted) {
      yield { type: 'ERROR', payload: makeDriverError(DriverErrorCode.CANCELLED, 'Cancelled') }
      return
    }

    yield { type: 'STARTED', payload: {} }

    switch (capabilityId) {
      case 'shell:execute': {
        try {
          const result = await runCommand(inp.command!, _cwd, context.signal)
          yield { type: 'RESULT', payload: { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode } }
        } catch (err) {
          if (context.signal?.aborted) {
            yield { type: 'ERROR', payload: makeDriverError(DriverErrorCode.CANCELLED, 'Cancelled') }
          } else {
            yield { type: 'ERROR', payload: makeDriverError(DriverErrorCode.EXECUTION_FAILED, (err as Error).message, { cause: err }) }
          }
          return
        }
        break
      }

      case 'shell:execute-stream': {
        const { shell, args } = shellArgs(inp.command!)
        const child = spawn(shell, args, { cwd: _cwd, env: { ...process.env, ..._env } })

        if (context.signal) {
          context.signal.addEventListener('abort', () => child.kill(), { once: true })
        }

        for await (const line of lines(child.stdout)) {
          yield { type: 'OUTPUT', payload: { text: line, stream: 'stdout' } }
        }
        for await (const line of lines(child.stderr)) {
          yield { type: 'OUTPUT', payload: { text: line, stream: 'stderr' } }
        }

        if (context.signal?.aborted) {
          yield { type: 'ERROR', payload: makeDriverError(DriverErrorCode.CANCELLED, 'Cancelled') }
          return
        }
        break
      }

      case 'shell:current-directory': {
        yield { type: 'RESULT', payload: _cwd }
        break
      }

      case 'shell:change-directory': {
        _cwd = inp.path!
        yield { type: 'RESULT', payload: { cwd: _cwd } }
        break
      }

      case 'shell:environment-get': {
        const key = inp.key
        const value = key ? (_env[key] ?? process.env[key]) : { ...process.env, ..._env }
        yield { type: 'RESULT', payload: value ?? null }
        break
      }

      case 'shell:environment-set': {
        _env[inp.key!] = inp.value!
        yield { type: 'RESULT', payload: { set: true } }
        break
      }

      case 'shell:terminal': {
        yield { type: 'ERROR', payload: makeDriverError(DriverErrorCode.NOT_IMPLEMENTED, 'shell:terminal is reserved for Stage 9D') }
        return
      }

      default: {
        yield { type: 'ERROR', payload: makeDriverError(DriverErrorCode.CAPABILITY_NOT_FOUND, `Unknown capability: ${capabilityId}`) }
        return
      }
    }

    yield { type: 'COMPLETE', payload: {} }
  }

  async health(): Promise<DriverHealth> {
    return { status: 'healthy', checkedAt: new Date() }
  }

  async shutdown(): Promise<void> {}
}

function runCommand(cmd: string, cwd: string, signal?: AbortSignal): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const { shell, args } = shellArgs(cmd)
    const child = spawn(shell, args, { cwd, env: { ...process.env, ..._env } })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    if (signal) {
      signal.addEventListener('abort', () => { child.kill(); reject(new Error('Cancelled')) }, { once: true })
    }
    child.once('close', (code: number | null) => resolve({ stdout, stderr, exitCode: code ?? 0 }))
    child.once('error', reject)
  })
}

async function* lines(stream: NodeJS.ReadableStream): AsyncGenerator<string> {
  let buf = ''
  for await (const chunk of stream) {
    buf += (chunk as Buffer).toString()
    const parts = buf.split('\n')
    buf = parts.pop() ?? ''
    for (const line of parts) yield line
  }
  if (buf) yield buf
}
