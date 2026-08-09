/**
 * @rohinik-org/agent
 *
 * SDK handles for the Stage 15 agent/delegation protocol.
 * Wraps @rohinik-org/agent-protocol-v1 route calls only — no RS1 internals.
 */

import type { BoundSchema } from '@rohinik-org/schema'
import { SchemaHashMismatchError } from '@rohinik-org/schema'
import type {
  AdmitAgentResponse,
  AgentInstanceResponse,
  AgentRunStatusResponse,
  CancelAgentRunResponse,
  DelegateTaskRequest,
  DelegateTaskResponse,
  AcceptDelegationResponse,
  RunDelegationResponse,
  AcceptDelegationResultResponse,
  CancelDelegationResponse,
  AgentRunEvidenceResponse,
  DelegationEvidenceResponse,
  OutputSchemaRef,
} from '@rohinik-org/agent-protocol-v1'

// ── TypedResult (T6) ──────────────────────────────────────────────────────────

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

// ── Minimal ExecutionHandle returned from DelegationHandle.run() ──────────────
// ponytail: mirrors @rohinik-org/client ExecutionHandle interface but avoids
// depending on the tarball from this package; T8 wires repo-engineer which
// already has the full client.

export interface ExecutionHandle {
  readonly executionId: string
}

// ── AgentSdkError ─────────────────────────────────────────────────────────────

export class AgentSdkError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AgentSdkError'
    this.status = status
  }
}

// ── Internal fetch helper ─────────────────────────────────────────────────────

async function request<T>(baseUrl: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }).catch(err => {
    const msg = err instanceof Error ? err.message : String(err)
    throw new AgentSdkError(`Cannot reach RS1 at ${baseUrl}: ${msg}`)
  })
  const data = await res.json() as T
  if (!res.ok) {
    const envelope = data as { error?: string; message?: string }
    throw new AgentSdkError(envelope.message ?? envelope.error ?? `HTTP ${res.status}`, res.status)
  }
  return data
}

// ── AgentHandle ───────────────────────────────────────────────────────────────

export class AgentHandle {
  constructor(
    private readonly baseUrl: string,
    readonly instanceId: string,
  ) {}

  metadata(): Promise<AgentInstanceResponse> {
    return request<AgentInstanceResponse>(this.baseUrl, 'GET', `/v1/agent-instances/${encodeURIComponent(this.instanceId)}`)
  }
}

// ── AgentRunHandle ────────────────────────────────────────────────────────────

export class AgentRunHandle {
  constructor(
    private readonly baseUrl: string,
    readonly runId: string,
  ) {}

  status(): Promise<AgentRunStatusResponse> {
    return request<AgentRunStatusResponse>(this.baseUrl, 'GET', `/v1/agent-runs/${encodeURIComponent(this.runId)}`)
  }

  cancel(reason?: string): Promise<CancelAgentRunResponse> {
    return request<CancelAgentRunResponse>(
      this.baseUrl, 'POST', `/v1/agent-runs/${encodeURIComponent(this.runId)}/cancel`,
      reason !== undefined ? { reason } : {},
    )
  }

  async delegate(params: Omit<DelegateTaskRequest, 'delegationId'> & { delegationId?: string }): Promise<DelegationHandle> {
    const res = await request<DelegateTaskResponse>(
      this.baseUrl, 'POST', `/v1/agent-runs/${encodeURIComponent(this.runId)}/delegations`,
      params,
    )
    return new DelegationHandle(this.baseUrl, res.delegatedTaskId, res.delegationId)
  }

  evidence(): Promise<AgentRunEvidenceResponse> {
    return request<AgentRunEvidenceResponse>(this.baseUrl, 'GET', `/v1/agent-runs/${encodeURIComponent(this.runId)}/evidence`)
  }
}

// ── DelegationHandle ──────────────────────────────────────────────────────────

export class DelegationHandle {
  constructor(
    private readonly baseUrl: string,
    readonly delegatedTaskId: string,
    readonly delegationId: string,
  ) {}

  accept(): Promise<AcceptDelegationResponse> {
    return request<AcceptDelegationResponse>(
      this.baseUrl, 'POST', `/v1/delegations/${encodeURIComponent(this.delegatedTaskId)}/accept`,
    )
  }

  async run(outputSchemaRef?: OutputSchemaRef): Promise<ExecutionHandle & { delegationId: string; delegatedTaskId: string }> {
    const body = outputSchemaRef !== undefined ? { outputSchemaRef } : {}
    const res = await request<RunDelegationResponse>(
      this.baseUrl, 'POST', `/v1/delegations/${encodeURIComponent(this.delegatedTaskId)}/run`,
      body,
    )
    return {
      executionId:     res.executionId,
      delegationId:    res.delegationId,
      delegatedTaskId: res.delegatedTaskId,
    }
  }

  submitResult(result: unknown): Promise<{ ok: boolean; state: string }> {
    return request<{ ok: boolean; state: string }>(
      this.baseUrl, 'POST', `/v1/delegations/${encodeURIComponent(this.delegatedTaskId)}/results`,
      { result },
    )
  }

  acceptResult(): Promise<AcceptDelegationResultResponse> {
    return request<AcceptDelegationResultResponse>(
      this.baseUrl, 'POST', `/v1/delegations/${encodeURIComponent(this.delegatedTaskId)}/results/accept`,
    )
  }

  rejectResult(reason?: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(
      this.baseUrl, 'POST', `/v1/delegations/${encodeURIComponent(this.delegatedTaskId)}/results/reject`,
      reason !== undefined ? { reason } : {},
    )
  }

  cancel(reason?: string): Promise<CancelDelegationResponse> {
    return request<CancelDelegationResponse>(
      this.baseUrl, 'POST', `/v1/delegations/${encodeURIComponent(this.delegatedTaskId)}/cancel`,
      reason !== undefined ? { reason } : {},
    )
  }

  evidence(): Promise<DelegationEvidenceResponse> {
    return request<DelegationEvidenceResponse>(
      this.baseUrl, 'GET', `/v1/delegations/${encodeURIComponent(this.delegatedTaskId)}/evidence`,
    )
  }

  // ── T6: Typed delegation ────────────────────────────────────────────────────

  async runAndWaitTyped<T>(
    schema: BoundSchema<T>,
    options?: { pollIntervalMs?: number; timeoutMs?: number },
  ): Promise<TypedResult<T>> {
    const pollIntervalMs = options?.pollIntervalMs ?? 500
    const timeoutMs      = options?.timeoutMs ?? 30_000

    // Register schema — 409 is idempotent
    const regRes = await fetch(`${this.baseUrl}/v1/schemas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schemaId: schema.schemaId, version: schema.version, schema: schema.rawSchema }),
    }).catch(err => { throw new AgentSdkError(`Schema registration failed: ${err instanceof Error ? err.message : String(err)}`) })

    if (regRes.status !== 201 && regRes.status !== 409) {
      throw new AgentSdkError(`Schema registration failed: HTTP ${regRes.status}`, regRes.status)
    }

    // Fire delegation run with outputSchemaRef
    const runRes = await request<RunDelegationResponse>(
      this.baseUrl, 'POST', `/v1/delegations/${encodeURIComponent(this.delegatedTaskId)}/run`,
      { outputSchemaRef: schema.ref() },
    )
    const executionId = runRes.executionId

    // Poll until terminal
    const terminal = ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT']
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const status = await request<{ state: string }>(
        this.baseUrl, 'GET', `/v1/executions/${encodeURIComponent(executionId)}`,
      )
      if (terminal.includes(status.state)) break
      if (pollIntervalMs > 0) await new Promise(r => setTimeout(r, pollIntervalMs))
    }

    // Fetch result
    const result = await request<{
      executionId: string
      output: unknown
      validationResult?: ValidationInfo
    }>(this.baseUrl, 'GET', `/v1/executions/${encodeURIComponent(executionId)}/result`)

    const { output, validationResult } = result

    if (!validationResult) {
      throw new AgentSdkError('No validationResult on typed delegation — outputSchemaRef was not bound server-side')
    }

    if (validationResult.outcome !== 'VALID') {
      throw new AgentSdkError(
        `Typed delegation failed validation: ${validationResult.outcome}${validationResult.firstError ? ` — ${validationResult.firstError}` : ''}`,
      )
    }

    const returnedHash = validationResult.schemaRef?.semanticHash
    if (returnedHash !== schema.semanticHash) {
      throw new SchemaHashMismatchError(schema.semanticHash, returnedHash ?? '(none)')
    }

    // Caller is responsible for acceptResult() — no auto-acceptance
    return { executionId, output: output as T, validation: validationResult }
  }
}

// ── Top-level admit() factory ─────────────────────────────────────────────────

export interface AdmitResult {
  readonly agent: AgentHandle
  readonly run:   AgentRunHandle
}

export async function admit(baseUrl: string, instanceId: string): Promise<AdmitResult> {
  const res = await request<AdmitAgentResponse>(baseUrl, 'POST', '/v1/agent-instances/admit', { instanceId })
  return {
    agent: new AgentHandle(baseUrl, instanceId),
    run:   new AgentRunHandle(baseUrl, res.runId),
  }
}
