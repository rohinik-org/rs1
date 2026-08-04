# RS-1 Runtime Client Parity Matrix

## Overview

Complete inventory of public exports from the original CLI client (`C:\Users\C5182688\Documents\Token_Saver\cli\src\client.ts`) for the RS-1 runtime migration. All entries are **INCLUDED** in the runtime-client package as this is a direct port.

---

## Exports: Error Classes

| Symbol | Kind | HTTP Method + Route | Request Type | Response Type | Status | Notes |
|--------|------|---------------------|--------------|---------------|--------|-------|
| `RohinikClientError` | class | N/A | N/A | N/A | INCLUDED | Error wrapper with status code and response body |

---

## Exports: Interfaces

| Symbol | Kind | HTTP Method + Route | Request Type | Response Type | Status | Notes |
|--------|------|---------------------|--------------|---------------|--------|-------|
| `RuntimeInfo` | interface | N/A | N/A | N/A | INCLUDED | Runtime state, features, build info, providers, extensions |
| `HealthInfo` | interface | N/A | N/A | N/A | INCLUDED | Health status (HEALTHY/DEGRADED/UNHEALTHY) with component details |
| `ExecuteRequest` | interface | N/A | N/A | N/A | INCLUDED | Content, contentType, intentHint, context, constraints |
| `ExecuteResponse` | interface | N/A | N/A | N/A | INCLUDED | Output, skillId, tierId, reasoning, confidence, timing |
| `SimulateResponse` | interface | N/A | N/A | N/A | INCLUDED | Routing decision, tier, skill, confidence, latency estimate |
| `CapabilityInfo` | interface | N/A | N/A | N/A | INCLUDED | List of capabilities with skill, name, tier, version |
| `DiagnosticsInfo` | interface | N/A | N/A | N/A | INCLUDED | Diagnostic warnings, errors, entries with severity/code/message |
| `StartupInfo` | interface | N/A | N/A | N/A | INCLUDED | Total duration, timeline stages with duration and status |
| `ProfileInfo` | interface | N/A | N/A | N/A | INCLUDED | Runtime profile: id, version, uptime, services, extensions, diagnostics |
| `CapabilityResult` | interface | N/A | N/A | N/A | INCLUDED | Execution result: value, driverId, executionId, duration |
| `DriverInfo` | interface | N/A | N/A | N/A | INCLUDED | Driver metadata: id, version, apiVersion, priority, capabilities, health |
| `AcquisitionSearchResult` | interface | N/A | N/A | N/A | INCLUDED | Candidates with manifest, source, version, publisher, score, trust level |
| `AcquisitionPlanResult` | interface | N/A | N/A | N/A | INCLUDED | Plan with planId, candidate, dependencies, trust decision, estimated duration |
| `AcquisitionInstallResult` | interface | N/A | N/A | N/A | INCLUDED | Success flag, capabilityId, version, acquisitionId, duration, reason |
| `InstalledCapabilityList` | interface | N/A | N/A | N/A | INCLUDED | Installed capabilities with id, version, state, source, dependencies |
| `AcquisitionSourceList` | interface | N/A | N/A | N/A | INCLUDED | Acquisition sources list |

---

## Exports: RohinikHttpClient Class

### Constructor

| Symbol | Kind | HTTP Method + Route | Request Type | Response Type | Status | Notes |
|--------|------|---------------------|--------------|---------------|--------|-------|
| `constructor` | method | N/A | `baseUrl: string` | N/A | INCLUDED | Initializes client with base URL (default: http://localhost:8080) |

### Public Methods: Runtime Info

| Symbol | Kind | HTTP Method + Route | Request Type | Response Type | Status | Notes |
|--------|------|---------------------|--------------|---------------|--------|-------|
| `getRuntime` | method | GET `/v1/runtime` | N/A | `RuntimeInfo` | INCLUDED | Fetch runtime state and configuration |
| `getHealth` | method | GET `/v1/health` | N/A | `HealthInfo` | INCLUDED | Check health status of runtime and components |
| `getDiagnostics` | method | GET `/v1/diagnostics` | N/A | `DiagnosticsInfo` | INCLUDED | Retrieve diagnostic warnings and errors |
| `getStartup` | method | GET `/v1/startup` | N/A | `StartupInfo` | INCLUDED | Get startup timeline and duration |
| `getProfile` | method | GET `/v1/profile` | N/A | `ProfileInfo` | INCLUDED | Comprehensive runtime profile |
| `shutdown` | method | POST `/v1/shutdown` | N/A | `{ requestId: string; message: string }` | INCLUDED | Gracefully shutdown runtime |

### Public Methods: Capabilities & Drivers

| Symbol | Kind | HTTP Method + Route | Request Type | Response Type | Status | Notes |
|--------|------|---------------------|--------------|---------------|--------|-------|
| `listCapabilities` | method | GET `/v1/capabilities` | N/A | `CapabilityInfo` | INCLUDED | List all available capabilities |
| `executeCapability` | method | POST `/v1/{pack}` | `{ capabilityId: string; input: unknown }` | `CapabilityResult` | INCLUDED | Execute a specific capability by ID |
| `listDrivers` | method | GET `/v1/drivers` | N/A | `DriverInfo[]` | INCLUDED | List all loaded drivers |
| `getProviders` | method | GET `/v1/providers` | N/A | `{ requestId: string; providers: unknown[] }` | INCLUDED | List providers |
| `getExtensions` | method | GET `/v1/extensions` | N/A | `{ requestId: string; extensions: unknown[] }` | INCLUDED | List extensions |

### Public Methods: Execution & Simulation

| Symbol | Kind | HTTP Method + Route | Request Type | Response Type | Status | Notes |
|--------|------|---------------------|--------------|---------------|--------|-------|
| `execute` | method | POST `/v1/execute` | `ExecuteRequest` | `ExecuteResponse` | INCLUDED | Execute content/skill with full response |
| `simulate` | method | POST `/v1/simulate` | `ExecuteRequest` | `SimulateResponse` | INCLUDED | Simulate routing without executing |
| `getDecision` | method | GET `/v1/decisions/{requestId}` | `requestId: string` | `{ requestId: string; trace: unknown }` | INCLUDED | Retrieve decision trace for a request |

### Public Methods: Knowledge Management

| Symbol | Kind | HTTP Method + Route | Request Type | Response Type | Status | Notes |
|--------|------|---------------------|--------------|---------------|--------|-------|
| `extractKnowledge` | method | POST `/v1/knowledge/extract` | `{ path: string; content: string }` | `{ requestId: string; fragment: unknown }` | INCLUDED | Extract knowledge fragment from content |
| `queryKnowledge` | method | POST `/v1/knowledge/query` | `{ primitive?: string; kind?: string; label?: string }` | `{ requestId: string; nodes: unknown[]; edges: unknown[] }` | INCLUDED | Query knowledge graph |
| `getKnowledgeEntities` | method | GET `/v1/knowledge/entities?kind={kind}` | `kind?: string` | `{ requestId: string; entities: unknown[] }` | INCLUDED | Get entities, optionally filtered by kind |
| `getKnowledgeProcedures` | method | GET `/v1/knowledge/procedures` | N/A | `{ requestId: string; procedures: unknown[] }` | INCLUDED | Get procedures |

### Public Methods: Capability Acquisition

| Symbol | Kind | HTTP Method + Route | Request Type | Response Type | Status | Notes |
|--------|------|---------------------|--------------|---------------|--------|-------|
| `acquisitionSearch` | method | POST `/v1/acquisition/search` | `{ term: string; version?: string }` | `AcquisitionSearchResult` | INCLUDED | Search for capabilities by term/version |
| `acquisitionPlan` | method | POST `/v1/acquisition/plan` | `{ term: string; policy?: unknown }` | `AcquisitionPlanResult` | INCLUDED | Plan capability installation |
| `acquisitionInstall` | method | POST `/v1/acquisition/install` | `{ term: string; policy?: unknown }` | `AcquisitionInstallResult` | INCLUDED | Install capability |
| `acquisitionUninstall` | method | DELETE `/v1/acquisition/install/{capabilityId}` | `capabilityId: string` | `{ requestId: string; success: boolean; capabilityId: string }` | INCLUDED | Uninstall capability |
| `listInstalledCapabilities` | method | GET `/v1/acquisition/installed` | N/A | `InstalledCapabilityList` | INCLUDED | List installed capabilities |
| `getAcquisitionSources` | method | GET `/v1/acquisition/sources` | N/A | `AcquisitionSourceList` | INCLUDED | List acquisition sources |

### Public Methods: Context & Prediction

| Symbol | Kind | HTTP Method + Route | Request Type | Response Type | Status | Notes |
|--------|------|---------------------|--------------|---------------|--------|-------|
| `buildContext` | method | POST `/v1/context/build` | `{ intent: { rawInput: string } }` | `{ contextId: string; confidence: number; contributors: string[]; knowledgeFragments: unknown[]; installedCapabilities: unknown[]; assembledAt: string }` | INCLUDED | Build execution context from intent |
| `getContextPolicy` | method | GET `/v1/context/policy` | N/A | `{ policyId: string; budget: { maxTokenBudget: number; maxMemories: number; maxKnowledgeFragments: number; maxCapabilities: number }; includeCapabilities: boolean; memoryRecency: string }` | INCLUDED | Get context policy and budget |
| `predict` | method | POST `/v1/prediction/predict` | `{ intent: { rawInput: string } }` | `{ predictionId: string; workingContextId: string; contributors: string[]; intentPrediction?: unknown; capabilityPrediction?: unknown; budgetPrediction?: { estimatedLatencyMs: number; estimatedTokens: number; estimatedCostUsd: number }; failurePrediction?: { failureProbability: number; confidence: number; reasons: string[] }; memoryPrediction?: unknown; workflowPrediction?: unknown }` | INCLUDED | Predict capabilities and outcomes for intent |
| `getPredictionPolicy` | method | GET `/v1/prediction/policy` | N/A | `{ policyId: string; allowRemote: boolean; maxLatencyMs: number; minimumConfidence: number }` | INCLUDED | Get prediction policy |

### Public Methods: Planning & Execution

| Symbol | Kind | HTTP Method + Route | Request Type | Response Type | Status | Notes |
|--------|------|---------------------|--------------|---------------|--------|-------|
| `plannerPlan` | method | POST `/v1/planner/plan` | `{ context: { rawInput: string } }` | `{ decisionId: string; requestId: string; evaluations: unknown[]; selectedPlan: { planId: string; steps: unknown[] }; selectedScore: number; explanation: { selectedReason: string; rejectedReasons: unknown[] }; metrics: { planningDurationMs: number; candidateCount: number; decisionConfidence: number; selectionMargin: number; planningAlgorithmVersion: string }; producedAt: string }` | INCLUDED | Generate execution plan |
| `plannerDryRun` | method | POST `/v1/planner/plan/dry-run` | `{ context: { rawInput: string } }` | `{ decisionId: string; requestId: string; evaluations: unknown[]; selectedPlan: { planId: string; steps: unknown[] }; selectedScore: number; explanation: { selectedReason: string; rejectedReasons: unknown[] }; metrics: { planningDurationMs: number; candidateCount: number; decisionConfidence: number; selectionMargin: number; planningAlgorithmVersion: string }; producedAt: string; dryRun: boolean }` | INCLUDED | Dry-run plan without executing |
| `getPlannerPolicy` | method | GET `/v1/planner/policy` | N/A | `{ policyId: string; preferInstalledCapabilities: boolean; allowCapabilityAcquisition: boolean; preferLowerLatency: boolean; preferLowerCost: boolean; riskTolerance: number; maxAlternatives: number }` | INCLUDED | Get planner policy |
| `executionRun` | method | POST `/v1/execution/run` | `{ context: { rawInput: string } }` | `{ resultId: string; sessionId: string; executionId: string; decisionId: string; planId: string; finalState: string; stepRecords: unknown[]; totalDurationMs: number; completedAt: string }` | INCLUDED | Execute plan |
| `executionCancel` | method | POST `/v1/execution/cancel` | `{ sessionId: string }` | `{ cancelled: boolean; sessionId: string }` | INCLUDED | Cancel execution session |
| `executionStatus` | method | GET `/v1/execution/{sessionId}` | `sessionId: string` | `{ sessionId: string; executionId: string; decisionId: string; planId: string; state: string; stepRecords: unknown[]; startedAt: string; completedAt?: string; cancelledAt?: string }` | INCLUDED | Get execution status |
| `executionEvents` | method | GET `/v1/execution/{sessionId}/events` | `sessionId: string` | `unknown[]` | INCLUDED | Get execution events stream |

### Public Methods: Evaluation & Experience

| Symbol | Kind | HTTP Method + Route | Request Type | Response Type | Status | Notes |
|--------|------|---------------------|--------------|---------------|--------|-------|
| `evaluationEvaluate` | method | POST `/v1/evaluation/evaluate` | `{ context: { rawInput: string } }` | `unknown` | INCLUDED | Evaluate execution |
| `evaluationDryRun` | method | POST `/v1/evaluation/evaluate/dry-run` | `{ context: { rawInput: string } }` | `unknown` | INCLUDED | Dry-run evaluation |
| `getEvaluationPolicy` | method | GET `/v1/evaluation/policy` | N/A | `unknown` | INCLUDED | Get evaluation policy |
| `experienceRecord` | method | POST `/v1/experience/record` | `{ context: { rawInput: string } }` | `unknown` | INCLUDED | Record experience |
| `experienceDryRun` | method | POST `/v1/experience/record/dry-run` | `{ context: { rawInput: string } }` | `unknown` | INCLUDED | Dry-run experience recording |
| `experienceStoreStats` | method | GET `/v1/experience/store/stats` | N/A | `unknown` | INCLUDED | Get experience store statistics |
| `experienceStoreHealth` | method | GET `/v1/experience/store/health` | N/A | `unknown` | INCLUDED | Get experience store health |
| `experienceQuery` | method | POST `/v1/experience/query` | `Record<string, unknown>` | `unknown` | INCLUDED | Query experience store |
| `experienceGetById` | method | GET `/v1/experience/{experienceId}` | `experienceId: string` | `unknown` | INCLUDED | Get experience by ID |

### Public Methods: Private Helpers (Internal)

| Symbol | Kind | HTTP Method + Route | Request Type | Response Type | Status | Notes |
|--------|------|---------------------|--------------|---------------|--------|-------|
| `request` | method | N/A | Generic handler | `<T>` | INCLUDED | Private generic HTTP request handler (type-safe fetch wrapper) |

---

## Summary Statistics

- **Total Public Exports**: 54
  - Error Classes: 1
  - Interfaces: 16
  - Classes: 1 (RohinikHttpClient)
  - Class Methods: 36
  - Private/Internal Methods: 1 (request handler)

- **HTTP Endpoints Covered**: 41 unique endpoints
- **Request Types Defined**: 8 explicit interfaces + inline objects
- **Response Types Defined**: 8 explicit interfaces + inline objects + generic unknowns

---

## Exclusions

**None.** All public exports from the original CLI client are included in the runtime-client package. The `RohinikHttpClient` class contains no CLI-specific code (no chalk, commander, terminal formatting, or other CLI dependencies). All methods are pure HTTP abstractions suitable for direct porting to the runtime-client package.

---

## Implementation Notes

1. **BaseUrl Configuration**: Constructor accepts custom baseUrl (defaults to `http://localhost:8080`). Trailing slashes are normalized.

2. **Error Handling**: All methods delegate to private `request()` generic handler which:
   - Wraps fetch calls
   - Parses error responses as JSON or returns generic HTTP error
   - Throws `RohinikClientError` on failure
   - Re-throws with connection error context if fetch itself fails

3. **Type Safety**: All methods use TypeScript generics for strict response typing. Several response objects use `unknown[]` for extensibility (evaluations, stepRecords, candidatesConsidered, etc.).

4. **Request Encoding**: Path parameters are URL-encoded; query strings are built inline.

5. **JSON Content-Type**: Applied only when request body exists.

---

## Port Readiness

✓ All 36 public methods are platform-agnostic HTTP operations.
✓ No CLI-specific dependencies or formatting code to remove.
✓ No authentication/token management (base client responsibility).
✓ Ready for direct migration to runtime-client as-is.
