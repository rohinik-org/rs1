import type {
  ExecuteRequest,
  ExecuteResponse,
  SimulateResponse,
  HealthResponse,
  DecisionResponse,
  ExperienceResponse,
  ApiErrorBody,
  AgentAdmitRequest,
  AgentAdmitResponse,
  AgentStartResponse,
  AgentRunResponse,
  DelegateRequest,
  DelegateResponse,
  DelegationRunResponse,
  DelegationAcceptResultResponse,
  AgentEvidenceResponse,
} from './types.js'
import { RohinikError } from './types.js'

export interface RohinikClientConfig {
  readonly endpoint: string
  readonly timeoutMs?: number
}

export class RohinikClient {
  private readonly endpoint: string
  private readonly timeoutMs: number

  constructor(config: RohinikClientConfig) {
    this.endpoint = config.endpoint.replace(/\/$/, '')
    this.timeoutMs = config.timeoutMs ?? 30_000
  }

  private signal(): AbortSignal {
    return AbortSignal.timeout(this.timeoutMs)
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.endpoint}${path}`
    const hasBody = body !== undefined
    const init: RequestInit = {
      method,
      signal: this.signal(),
      headers: hasBody
        ? { 'Content-Type': 'application/json', Accept: 'application/json' }
        : { Accept: 'application/json' },
    }
    if (hasBody) {
      init.body = JSON.stringify(body)
    }

    let res: Response
    try {
      res = await fetch(url, init)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new RohinikError('NETWORK_ERROR', `Request to ${url} failed: ${msg}`, 0)
    }

    const text = await res.text()
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new RohinikError('INVALID_RESPONSE', `Non-JSON response from ${url}: ${text.slice(0, 200)}`, res.status)
    }

    if (!res.ok) {
      const err = json as Partial<ApiErrorBody>
      throw new RohinikError(
        err.code ?? 'HTTP_ERROR',
        err.message ?? `HTTP ${res.status}`,
        res.status,
      )
    }

    return json as T
  }

  health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/v1/health')
  }

  execute(req: ExecuteRequest): Promise<ExecuteResponse> {
    return this.request<ExecuteResponse>('POST', '/v1/execute', req)
  }

  simulate(req: ExecuteRequest): Promise<SimulateResponse> {
    return this.request<SimulateResponse>('POST', '/v1/simulate', req)
  }

  getDecision(requestId: string): Promise<DecisionResponse> {
    return this.request<DecisionResponse>('GET', `/v1/decisions/${encodeURIComponent(requestId)}`)
  }

  getExperience(experienceId: string): Promise<ExperienceResponse> {
    return this.request<ExperienceResponse>('GET', `/v1/experience/${encodeURIComponent(experienceId)}`)
  }

  // ── Agent runtime ────────────────────────────────────────────────────────────

  agentAdmit(req: AgentAdmitRequest): Promise<AgentAdmitResponse> {
    return this.request<AgentAdmitResponse>('POST', '/v1/agent-instances/admit', req)
  }

  agentStart(runId: string): Promise<AgentStartResponse> {
    return this.request<AgentStartResponse>('POST', '/v1/agent-runs', { runId })
  }

  agentGetRun(runId: string): Promise<AgentRunResponse> {
    return this.request<AgentRunResponse>('GET', `/v1/agent-runs/${encodeURIComponent(runId)}`)
  }

  agentDelegate(runId: string, req: DelegateRequest): Promise<DelegateResponse> {
    return this.request<DelegateResponse>('POST', `/v1/agent-runs/${encodeURIComponent(runId)}/delegations`, req)
  }

  delegationAccept(delegatedTaskId: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>('POST', `/v1/delegations/${encodeURIComponent(delegatedTaskId)}/accept`)
  }

  delegationRun(delegatedTaskId: string): Promise<DelegationRunResponse> {
    return this.request<DelegationRunResponse>('POST', `/v1/delegations/${encodeURIComponent(delegatedTaskId)}/run`)
  }

  delegationAcceptResult(delegatedTaskId: string): Promise<DelegationAcceptResultResponse> {
    return this.request<DelegationAcceptResultResponse>('POST', `/v1/delegations/${encodeURIComponent(delegatedTaskId)}/results/accept`)
  }

  agentEvidence(runId: string): Promise<AgentEvidenceResponse> {
    return this.request<AgentEvidenceResponse>('GET', `/v1/agent-runs/${encodeURIComponent(runId)}/evidence`)
  }
}
