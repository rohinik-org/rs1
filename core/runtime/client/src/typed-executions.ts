import type { BoundSchema } from '@rohinik-org/schema'
import { SchemaHashMismatchError } from '@rohinik-org/schema'
import { RohinikClientError } from './client.js'

// ── Public types ──────────────────────────────────────────────────────────────

export interface AsyncExecuteRequest {
  content: string
  contentType: string
  intentHint?: string
  idempotencyKey?: string
  context?: Record<string, unknown>
}

export interface ValidationInfo {
  readonly outcome: string
  readonly errorCount: number
  readonly firstError?: string
  readonly schemaRef?: { schemaId: string; version: string; semanticHash: string }
}

export interface TypedResult<T> {
  readonly executionId: string
  readonly output: T
  readonly validation: ValidationInfo
}

export interface TypedExecution<T> {
  readonly executionId: string
  waitForTypedResult(options?: { pollIntervalMs?: number; timeoutMs?: number }): Promise<TypedResult<T>>
}

// ── ExecutionsNamespace ───────────────────────────────────────────────────────

export class ExecutionsNamespace {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }).catch(err => {
      const msg = err instanceof Error ? err.message : String(err)
      throw new RohinikClientError(`Cannot reach Rohinik runtime at ${this.baseUrl}: ${msg}`)
    })
    const data = await res.json() as T
    return { status: res.status, data }
  }

  async startTyped<T>(
    schema: BoundSchema<T>,
    request: AsyncExecuteRequest,
  ): Promise<TypedExecution<T>> {
    // Register schema — 409 is ok (already registered)
    const regRes = await this.request('POST', '/v1/schemas', {
      schemaId: schema.schemaId,
      version: schema.version,
      schema: schema.rawSchema,
    })
    if (regRes.status !== 201 && regRes.status !== 409) {
      throw new RohinikClientError(`Schema registration failed: HTTP ${regRes.status}`, regRes.status, regRes.data)
    }

    // Submit execution
    const submitRes = await this.request<{ executionId: string }>('POST', '/v1/executions', {
      ...request,
      outputSchemaRef: schema.ref(),
    })
    if (submitRes.status !== 202) {
      throw new RohinikClientError(`Execution submit failed: HTTP ${submitRes.status}`, submitRes.status, submitRes.data)
    }
    const { executionId } = submitRes.data

    const ns = this
    return {
      executionId,
      async waitForTypedResult(options = {}): Promise<TypedResult<T>> {
        const { pollIntervalMs = 200, timeoutMs = 30_000 } = options
        const terminal = ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT']
        const deadline = Date.now() + timeoutMs

        while (Date.now() < deadline) {
          const statusRes = await ns.request<{ state: string }>('GET', `/v1/executions/${executionId}`)
          const { state } = statusRes.data
          if (terminal.includes(state)) break
          await new Promise(r => setTimeout(r, pollIntervalMs))
        }

        const resultRes = await ns.request<{
          executionId: string
          output: unknown
          validationResult?: ValidationInfo
        }>('GET', `/v1/executions/${executionId}/result`)

        const { output, validationResult } = resultRes.data

        if (!validationResult) {
          throw new RohinikClientError('No validationResult on typed execution — outputSchemaRef was not bound server-side')
        }

        if (validationResult.outcome !== 'VALID') {
          throw new RohinikClientError(
            `Typed execution failed validation: ${validationResult.outcome}${validationResult.firstError ? ` — ${validationResult.firstError}` : ''}`,
            undefined,
            validationResult,
          )
        }

        // Verify the server validated against exactly our schema
        const returnedHash = validationResult.schemaRef?.semanticHash
        if (returnedHash !== schema.semanticHash) {
          throw new SchemaHashMismatchError(schema.semanticHash, returnedHash ?? '(none)')
        }

        return {
          executionId,
          output: output as T,
          validation: validationResult,
        }
      },
    }
  }
}
