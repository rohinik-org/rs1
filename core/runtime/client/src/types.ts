export interface RuntimeInfo {
  requestId: string
  runtimeId: string
  state: string
  uptime?: number
  features: Record<string, boolean>
  build?: Record<string, string>
  providers?: Array<{ id: string; healthy: boolean }>
  extensions?: Array<{ id: string; version: string; type: string }>
}

export interface HealthInfo {
  requestId: string
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY'
  runtime?: { status: string }
  kernel?: { status: string }
  providers?: { status: string; items: Array<{ id: string; status: string; message?: string }> }
}

export interface ExecuteRequest {
  requestId?: string
  content: string
  contentType: string
  intentHint?: string
  context?: Record<string, unknown>
  constraints?: { allowReasoning?: boolean }
}

export interface ExecuteResponse {
  requestId: string
  output: unknown
  skillId: string
  tierId?: string
  reasoningInvoked: boolean
  confidence: number
  executionTimeMs: number
  explanation: string
}

export interface SimulateResponse {
  requestId: string
  wouldRoute: boolean
  selectedTier?: string
  selectedSkill?: string
  confidence: number
  estimatedLatencyMs: number
  reasoningWouldBeInvoked: boolean
  candidatesConsidered: Array<{ skillId: string; tierId: string; score: number }>
}

export interface CapabilityInfo {
  requestId: string
  capabilities: Array<{ skillId: string; name: string; tierId: string; version: string }>
}

export interface DiagnosticsInfo {
  requestId: string
  summary: { warnings: number; errors: number; total: number }
  entries: Array<{ severity: string; code: string; message: string }>
}

export interface StartupInfo {
  requestId: string
  totalDurationMs: number
  timeline: Array<{ stageName: string; durationMs: number; status: string }>
}

export interface ProfileInfo {
  requestId: string
  runtimeId: string
  version: string
  uptimeMs: number
  capabilities: unknown[]
  providers: unknown[]
  servicesStarted: string[]
  extensionsLoaded: number
  builtinsLoaded: number
  startupDurationMs: number
  diagnosticSummary: { warnings: number; errors: number }
}

export interface CapabilityResult {
  requestId: string
  executionId: string
  driverId: string
  capabilityId: string
  value: unknown
  durationMs: number
}

export interface DriverInfo {
  id: string
  version: string
  apiVersion: number
  priority: number
  capabilities: Record<string, boolean>
  health?: { status: string; message?: string }
}

export interface AcquisitionSearchResult {
  requestId: string
  candidates: Array<{
    candidateId: string
    manifest: { id: string; name: string; version: string; description: string; tier: string; tags: string[] }
    source: { type: string; id: string; uri?: string }
    version: string
    publisher: string
    score: number
    trustLevel: string
    compatibilityStatus: string
  }>
}

export interface AcquisitionPlanResult {
  requestId: string
  plan: {
    planId: string
    candidate: unknown
    resolvedDependencies: unknown[]
    trustDecision: unknown
    estimatedDurationMs: number
    createdAt: string
  } | null
  reason?: string
}

export interface AcquisitionInstallResult {
  requestId: string
  success: boolean
  capabilityId?: string
  version?: string
  acquisitionId?: string
  durationMs?: number
  reason?: string
}

export interface InstalledCapabilityList {
  requestId: string
  installed: Array<{
    capabilityId: string
    version: string
    state: string
    installedAt: string
    source: { type: string; id: string; uri?: string }
    dependencies: string[]
  }>
}

export interface AcquisitionSourceList {
  requestId: string
  sources: Array<{ sourceId: string; sourceType: string }>
}
