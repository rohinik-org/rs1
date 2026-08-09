import type {
  RuntimeInfo,
  HealthInfo,
  ExecuteRequest,
  ExecuteResponse,
  SimulateResponse,
  CapabilityInfo,
  DiagnosticsInfo,
  StartupInfo,
  ProfileInfo,
  CapabilityResult,
  DriverInfo,
  AcquisitionSearchResult,
  AcquisitionPlanResult,
  AcquisitionInstallResult,
  InstalledCapabilityList,
  AcquisitionSourceList,
} from './types.js'
import { ExecutionsNamespace } from './typed-executions.js'

export class RohinikClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = 'RohinikClientError'
  }
}

export class RohinikHttpClient {
  readonly baseUrl: string
  readonly executions: ExecutionsNamespace

  constructor(baseUrl = 'http://localhost:8080') {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.executions = new ExecutionsNamespace(this.baseUrl)
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ code: 'UNKNOWN', message: `HTTP ${res.status}` })) as { code?: string; message?: string }
        throw new RohinikClientError(err.message ?? `HTTP ${res.status}`, res.status, err)
      }
      return res.json() as Promise<T>
    } catch (err) {
      if (err instanceof RohinikClientError) throw err
      const msg = err instanceof Error ? err.message : String(err)
      throw new RohinikClientError(`Cannot reach Rohinik runtime at ${this.baseUrl}: ${msg}`)
    }
  }

  getRuntime(): Promise<RuntimeInfo> {
    return this.request<RuntimeInfo>('GET', '/v1/runtime')
  }

  getHealth(): Promise<HealthInfo> {
    return this.request<HealthInfo>('GET', '/v1/health')
  }

  listCapabilities(): Promise<CapabilityInfo> {
    return this.request<CapabilityInfo>('GET', '/v1/capabilities')
  }

  getProviders(): Promise<{ requestId: string; providers: unknown[] }> {
    return this.request('GET', '/v1/providers')
  }

  getExtensions(): Promise<{ requestId: string; extensions: unknown[] }> {
    return this.request('GET', '/v1/extensions')
  }

  execute(req: ExecuteRequest): Promise<ExecuteResponse> {
    return this.request<ExecuteResponse>('POST', '/v1/execute', req)
  }

  simulate(req: ExecuteRequest): Promise<SimulateResponse> {
    return this.request<SimulateResponse>('POST', '/v1/simulate', req)
  }

  getDecision(requestId: string): Promise<{ requestId: string; trace: unknown }> {
    return this.request('GET', `/v1/decisions/${encodeURIComponent(requestId)}`)
  }

  shutdown(): Promise<{ requestId: string; message: string }> {
    return this.request('POST', '/v1/shutdown')
  }

  getDiagnostics(): Promise<DiagnosticsInfo> {
    return this.request<DiagnosticsInfo>('GET', '/v1/diagnostics')
  }

  getStartup(): Promise<StartupInfo> {
    return this.request<StartupInfo>('GET', '/v1/startup')
  }

  getProfile(): Promise<ProfileInfo> {
    return this.request<ProfileInfo>('GET', '/v1/profile')
  }

  executeCapability(capabilityId: string, input: unknown): Promise<CapabilityResult> {
    // ponytail: ?? fallback required by noUncheckedIndexedAccess
    const pack = capabilityId.split(':')[0] ?? capabilityId
    return this.request<CapabilityResult>('POST', `/v1/${pack}`, { capabilityId, input })
  }

  listDrivers(): Promise<DriverInfo[]> {
    return this.request<DriverInfo[]>('GET', '/v1/drivers')
  }

  extractKnowledge(path: string, content: string): Promise<{ requestId: string; fragment: unknown }> {
    return this.request('POST', '/v1/knowledge/extract', { path, content })
  }

  queryKnowledge(query: { primitive?: string; kind?: string; label?: string }): Promise<{ requestId: string; nodes: unknown[]; edges: unknown[] }> {
    return this.request('POST', '/v1/knowledge/query', query)
  }

  getKnowledgeEntities(kind?: string): Promise<{ requestId: string; entities: unknown[] }> {
    const qs = kind ? `?kind=${encodeURIComponent(kind)}` : ''
    return this.request('GET', `/v1/knowledge/entities${qs}`)
  }

  getKnowledgeProcedures(): Promise<{ requestId: string; procedures: unknown[] }> {
    return this.request('GET', '/v1/knowledge/procedures')
  }

  acquisitionSearch(term: string, version?: string): Promise<AcquisitionSearchResult> {
    return this.request<AcquisitionSearchResult>('POST', '/v1/acquisition/search', { term, version })
  }

  acquisitionPlan(term: string, policy?: unknown): Promise<AcquisitionPlanResult> {
    return this.request<AcquisitionPlanResult>('POST', '/v1/acquisition/plan', { term, policy })
  }

  acquisitionInstall(term: string, policy?: unknown): Promise<AcquisitionInstallResult> {
    return this.request<AcquisitionInstallResult>('POST', '/v1/acquisition/install', { term, policy })
  }

  acquisitionUninstall(capabilityId: string): Promise<{ requestId: string; success: boolean; capabilityId: string }> {
    return this.request('DELETE', `/v1/acquisition/install/${encodeURIComponent(capabilityId)}`)
  }

  listInstalledCapabilities(): Promise<InstalledCapabilityList> {
    return this.request<InstalledCapabilityList>('GET', '/v1/acquisition/installed')
  }

  getAcquisitionSources(): Promise<AcquisitionSourceList> {
    return this.request<AcquisitionSourceList>('GET', '/v1/acquisition/sources')
  }

  buildContext(intentText: string): Promise<{ contextId: string; confidence: number; contributors: string[]; knowledgeFragments: unknown[]; installedCapabilities: unknown[]; assembledAt: string }> {
    return this.request('POST', '/v1/context/build', { intent: { rawInput: intentText } })
  }

  getContextPolicy(): Promise<{ policyId: string; budget: { maxTokenBudget: number; maxMemories: number; maxKnowledgeFragments: number; maxCapabilities: number }; includeCapabilities: boolean; memoryRecency: string }> {
    return this.request('GET', '/v1/context/policy')
  }

  predict(intentText: string): Promise<{ predictionId: string; workingContextId: string; contributors: string[]; intentPrediction?: unknown; capabilityPrediction?: unknown; budgetPrediction?: { estimatedLatencyMs: number; estimatedTokens: number; estimatedCostUsd: number }; failurePrediction?: { failureProbability: number; confidence: number; reasons: string[] }; memoryPrediction?: unknown; workflowPrediction?: unknown }> {
    return this.request('POST', '/v1/prediction/predict', { intent: { rawInput: intentText } })
  }

  getPredictionPolicy(): Promise<{ policyId: string; allowRemote: boolean; maxLatencyMs: number; minimumConfidence: number }> {
    return this.request('GET', '/v1/prediction/policy')
  }

  plannerPlan(intentText: string): Promise<{ decisionId: string; requestId: string; evaluations: unknown[]; selectedPlan: { planId: string; steps: unknown[] }; selectedScore: number; explanation: { selectedReason: string; rejectedReasons: unknown[] }; metrics: { planningDurationMs: number; candidateCount: number; decisionConfidence: number; selectionMargin: number; planningAlgorithmVersion: string }; producedAt: string }> {
    return this.request('POST', '/v1/planner/plan', { context: { rawInput: intentText } })
  }

  plannerDryRun(intentText: string): Promise<{ decisionId: string; requestId: string; evaluations: unknown[]; selectedPlan: { planId: string; steps: unknown[] }; selectedScore: number; explanation: { selectedReason: string; rejectedReasons: unknown[] }; metrics: { planningDurationMs: number; candidateCount: number; decisionConfidence: number; selectionMargin: number; planningAlgorithmVersion: string }; producedAt: string; dryRun: boolean }> {
    return this.request('POST', '/v1/planner/plan/dry-run', { context: { rawInput: intentText } })
  }

  getPlannerPolicy(): Promise<{ policyId: string; preferInstalledCapabilities: boolean; allowCapabilityAcquisition: boolean; preferLowerLatency: boolean; preferLowerCost: boolean; riskTolerance: number; maxAlternatives: number }> {
    return this.request('GET', '/v1/planner/policy')
  }

  executionRun(intentText: string): Promise<{ resultId: string; sessionId: string; executionId: string; decisionId: string; planId: string; finalState: string; stepRecords: unknown[]; totalDurationMs: number; completedAt: string }> {
    return this.request('POST', '/v1/execution/run', { context: { rawInput: intentText } })
  }

  executionCancel(sessionId: string): Promise<{ cancelled: boolean; sessionId: string }> {
    return this.request('POST', '/v1/execution/cancel', { sessionId })
  }

  executionStatus(sessionId: string): Promise<{ sessionId: string; executionId: string; decisionId: string; planId: string; state: string; stepRecords: unknown[]; startedAt: string; completedAt?: string; cancelledAt?: string }> {
    return this.request('GET', `/v1/execution/${sessionId}`)
  }

  executionEvents(sessionId: string): Promise<unknown[]> {
    return this.request('GET', `/v1/execution/${sessionId}/events`)
  }

  evaluationEvaluate(intentText: string): Promise<unknown> {
    return this.request('POST', '/v1/evaluation/evaluate', { context: { rawInput: intentText } })
  }

  evaluationDryRun(intentText: string): Promise<unknown> {
    return this.request('POST', '/v1/evaluation/evaluate/dry-run', { context: { rawInput: intentText } })
  }

  getEvaluationPolicy(): Promise<unknown> {
    return this.request('GET', '/v1/evaluation/policy')
  }

  experienceRecord(intentText: string): Promise<unknown> {
    return this.request('POST', '/v1/experience/record', { context: { rawInput: intentText } })
  }

  experienceDryRun(intentText: string): Promise<unknown> {
    return this.request('POST', '/v1/experience/record/dry-run', { context: { rawInput: intentText } })
  }

  experienceStoreStats(): Promise<unknown> {
    return this.request('GET', '/v1/experience/store/stats')
  }

  experienceStoreHealth(): Promise<unknown> {
    return this.request('GET', '/v1/experience/store/health')
  }

  experienceQuery(query: Record<string, unknown>): Promise<unknown> {
    return this.request('POST', '/v1/experience/query', query)
  }

  experienceGetById(experienceId: string): Promise<unknown> {
    return this.request('GET', `/v1/experience/${encodeURIComponent(experienceId)}`)
  }
}
