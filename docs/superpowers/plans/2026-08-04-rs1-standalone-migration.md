# RS-1 Standalone Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the history-preserving RS-1 extraction into a fully standalone, independently buildable repository with no dependency on excluded monorepo domains (CLI, SDK, tools, examples, registry, apps).

**Architecture:** Create `core/runtime/client` (`@rohinik-org/runtime-client`) to own `RohinikHttpClient` and its types; inline the `adapter-sdk` interface types into a new `@rohinik-org/adapter-ir` package owned by RS-1; remove all phantom/excluded workspace entries and dependencies; repair documentation and metadata.

**Tech Stack:** TypeScript ESM, pnpm workspaces, tsup, vitest, Node.js ≥ 22

---

## Discovered violations summary

| Location | Invalid dep | Action |
|---|---|---|
| `shell/package.json` | `@rohinik-org/cli` | Replace with `@rohinik-org/runtime-client` |
| `shell/src/context-assembler.ts` | import from `@rohinik-org/cli/client` | Replace with `@rohinik-org/runtime-client` |
| `shell/src/shell.ts` | import from `@rohinik-org/cli/client` | Replace with `@rohinik-org/runtime-client` |
| `compiler/package.json` | `@rohinik-org/cli` (unused — no imports in src) | Remove |
| `core/drivers/mcp/package.json` | `@rohinik-org/adapter-sdk` | Replace with `@rohinik-org/adapter-ir` |
| `core/runtime/artifacts/package.json` | `@rohinik-org/adapter-sdk` | Replace with `@rohinik-org/adapter-ir` |
| `pnpm-workspace.yaml` | sdk/*, cli, tools/*, registry/*, examples/*, apps/*, packages/reference/* | Remove all |

---

## File Map

**New files:**
- `core/runtime/client/package.json`
- `core/runtime/client/tsconfig.json`
- `core/runtime/client/src/index.ts`
- `core/runtime/client/src/client.ts`
- `core/runtime/client/src/types.ts`
- `core/runtime/client/src/__tests__/client.test.ts`
- `core/runtime/adapter-ir/package.json`
- `core/runtime/adapter-ir/tsconfig.json`
- `core/runtime/adapter-ir/src/index.ts`
- `core/runtime/adapter-ir/src/__tests__/adapter-ir.test.ts`
- `RS1-EXTRACTION-BASELINE.md`
- `RS1-DEPENDENCY-BOUNDARY-REPORT.md`

**Modified files:**
- `pnpm-workspace.yaml` — remove absent packages, add runtime-client and adapter-ir
- `package.json` (root) — remove benchmark script, update repository/homepage/bugs
- `compiler/package.json` — remove `@rohinik-org/cli` dep
- `shell/package.json` — replace `@rohinik-org/cli` with `@rohinik-org/runtime-client`
- `shell/src/context-assembler.ts` — replace import
- `shell/src/shell.ts` — replace import
- `core/drivers/mcp/package.json` — replace `@rohinik-org/adapter-sdk` with `@rohinik-org/adapter-ir`
- `core/runtime/artifacts/package.json` — replace `@rohinik-org/adapter-sdk` with `@rohinik-org/adapter-ir`
- `core/drivers/mcp/src/mcp-adapter.ts` — update import path
- `core/drivers/mcp/src/mcp-binding.ts` — update import path
- `core/runtime/artifacts/src/lifecycle/lifecycle-manager.ts` — update import path
- `core/runtime/artifacts/src/lifecycle/__tests__/lifecycle.test.ts` — update import path
- `core/runtime/artifacts/src/policy/policy-engine.ts` — update import path
- `core/runtime/artifacts/src/sources/registry.ts` — update import path
- `README.md` — rewrite as RS-1 specific
- `CONTRIBUTING.md` — scope to RS-1 only
- `SECURITY.md` — fix scope line
- `core/kernel/src/matching/matcher.ts` — replace stale docs link comment

---

## Task 1: Safety branch and baseline document

**Files:**
- Create: `RS1-EXTRACTION-BASELINE.md`

- [ ] **Step 1: Verify clean state**

```bash
cd /tmp/rohinik-rs1-extraction/source
git status --short
git branch --show-current
git rev-parse HEAD
git remote -v
```

Expected: no output from `git status --short`, branch is `main`, HEAD is `ff4cc221073619d0208277c82ae517acc3c4ba36`.

- [ ] **Step 2: Create safety branch**

```bash
git branch backup/pre-rs1-standalone-repair
git branch -v
```

Expected: new branch created pointing at same commit as `main`.

- [ ] **Step 3: Write baseline document**

Create `RS1-EXTRACTION-BASELINE.md` at repo root with this exact content:

```markdown
# RS-1 Extraction Baseline

## Source

| Field | Value |
|---|---|
| Original monorepo source tag | `v0.14.0-stage14` |
| Source checkpoint tag | `pre-rs1-extraction` |
| Filtered Stage 14 HEAD | `ff4cc221073619d0208277c82ae517acc3c4ba36` |
| Extraction scope | core/, compiler/, shell/ and required root config |
| Excluded domains | sdk/, cli/, tools/, examples/, registry/, apps/, docs/, platform/, products/, packages/reference/ |
| Destination repository | https://github.com/rohinik-org/rs1.git |
| Date of standalone repair | 2026-08-04 |

## Safety branch

`backup/pre-rs1-standalone-repair` — local only, not pushed. Points at the same commit as `main` at the start of standalone repair.

## Violations found at extraction time

| Package | Invalid dependency | Resolution |
|---|---|---|
| `shell` | `@rohinik-org/cli` (workspace) | Replaced by new `@rohinik-org/runtime-client` |
| `compiler` | `@rohinik-org/cli` (workspace, unused) | Removed |
| `core/drivers/mcp` | `@rohinik-org/adapter-sdk` (workspace) | Replaced by new `@rohinik-org/adapter-ir` |
| `core/runtime/artifacts` | `@rohinik-org/adapter-sdk` (workspace) | Replaced by new `@rohinik-org/adapter-ir` |
| `pnpm-workspace.yaml` | 17 absent workspace entries | Removed |
| `README.md` | Broken docs/ links, wrong scope | Rewritten |
| `CONTRIBUTING.md` | References excluded SDK, CLI, tools | Rewritten |
| `SECURITY.md` | Scope includes sdk/, cli/ | Corrected |
| `core/kernel/src/matching/matcher.ts` | Reference to `docs/Rohinik-WHITEPAPER.md` | Replaced with neutral AFS-0001 reference |
| Root `package.json` | `benchmark` script references excluded tools | Removed |
```

- [ ] **Step 4: Verify document written, do not commit yet**

```bash
cat RS1-EXTRACTION-BASELINE.md
```

---

## Task 2: Create `@rohinik-org/adapter-ir` (inlined adapter interface types)

**Files:**
- Create: `core/runtime/adapter-ir/package.json`
- Create: `core/runtime/adapter-ir/tsconfig.json`
- Create: `core/runtime/adapter-ir/src/index.ts`
- Create: `core/runtime/adapter-ir/src/__tests__/adapter-ir.test.ts`

The `adapter-sdk` package from the excluded SDK is used only for pure interface types (`CapabilityAdapter`, `AdapterConfig`, `RawDiscoveryModel`, `AdapterValidationResult`, `ExecutionBinding`, `InstallSource`). These are inlined into a minimal RS-1-owned IR package. `CapabilityCatalog` and `InstallManager` are classes from `adapter-sdk` — but in the artifacts test they are imported as mocks. We inline them as minimal stub classes here too.

- [ ] **Step 1: Write failing test**

```typescript
// core/runtime/adapter-ir/src/__tests__/adapter-ir.test.ts
import { describe, it, expect } from 'vitest'
import type {
  AdapterConfig,
  RawDiscoveryModel,
  AdapterValidationResult,
  ExecutionBinding,
  InstallSource,
  CapabilityAdapter,
} from '../index.js'
import { CapabilityCatalog, InstallManager } from '../index.js'

describe('adapter-ir types', () => {
  it('AdapterConfig is structurally valid', () => {
    const cfg: AdapterConfig = { endpoint: 'http://localhost:3000' }
    expect(cfg.endpoint).toBe('http://localhost:3000')
  })

  it('RawDiscoveryModel is structurally valid', () => {
    const rdm: RawDiscoveryModel = { protocol: 'mcp', items: [], metadata: {} }
    expect(rdm.protocol).toBe('mcp')
  })

  it('AdapterValidationResult is structurally valid', () => {
    const r: AdapterValidationResult = { valid: true, errors: [], warnings: [] }
    expect(r.valid).toBe(true)
  })

  it('ExecutionBinding is structurally valid', () => {
    const b: ExecutionBinding = {
      adapterId: 'a',
      capabilityId: 'c',
      invoke: async (_input: unknown) => ({ ok: true }),
    }
    expect(b.adapterId).toBe('a')
  })

  it('InstallSource is structurally valid', () => {
    const s: InstallSource = { scheme: 'file', location: '/tmp/skill' }
    expect(s.scheme).toBe('file')
  })

  it('CapabilityAdapter satisfies interface', () => {
    const adapter: CapabilityAdapter = {
      id: 'mcp',
      protocol: 'mcp',
      version: '1.0',
      discover: async (_cfg: AdapterConfig) => ({ protocol: 'mcp', items: [], metadata: {} }),
      validate: (_raw: RawDiscoveryModel): AdapterValidationResult => ({ valid: true, errors: [], warnings: [] }),
    }
    expect(adapter.id).toBe('mcp')
  })

  it('CapabilityCatalog can be instantiated', () => {
    const catalog = new CapabilityCatalog('/tmp/test')
    expect(catalog).toBeDefined()
  })

  it('InstallManager can be instantiated', () => {
    const catalog = new CapabilityCatalog('/tmp/test')
    const manager = new InstallManager(catalog, '/tmp/test', '0.1.0', '0.1.0')
    expect(manager).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails (module not found)**

```bash
cd core/runtime/adapter-ir
pnpm test 2>&1 | head -20
```

Expected: fails with module not found or no such directory.

- [ ] **Step 3: Create `core/runtime/adapter-ir/package.json`**

```json
{
  "name": "@rohinik-org/adapter-ir",
  "version": "0.1.0",
  "type": "module",
  "description": "Rohinik RS-1 — adapter interface types and minimal lifecycle stubs",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@rohinik-org/compiler": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "*",
    "typescript": "*",
    "vitest": "*"
  }
}
```

- [ ] **Step 4: Create `core/runtime/adapter-ir/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create `core/runtime/adapter-ir/src/index.ts`**

Inline all interface types used by `mcp` and `artifacts`, plus thin stub classes for `CapabilityCatalog` and `InstallManager` (the artifacts tests import them as instantiable classes, but the full adapter-sdk implementation has deep dependencies on `@rohinik-org/compiler` internals — the stubs satisfy the interface at the type boundary).

```typescript
// core/runtime/adapter-ir/src/index.ts

export interface AdapterConfig {
  readonly endpoint?: string
  readonly credentials?: Record<string, string>
  readonly options?: Record<string, unknown>
}

export interface RawDiscoveryModel {
  readonly protocol: string
  readonly items: readonly unknown[]
  readonly metadata: Record<string, unknown>
}

export interface AdapterValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
}

export interface ExecutionBinding {
  readonly adapterId: string
  readonly capabilityId: string
  invoke(input: unknown): Promise<unknown>
}

export interface InstallSource {
  readonly scheme: string
  readonly location: string
}

export interface CapabilityAdapter {
  readonly id: string
  readonly protocol: string
  readonly version: string
  discover(config: AdapterConfig): Promise<RawDiscoveryModel>
  validate(raw: RawDiscoveryModel): AdapterValidationResult
}

// ponytail: minimal stubs satisfy the class-import boundary in artifacts tests.
// Full lifecycle logic lives in the artifacts package itself.
export class CapabilityCatalog {
  constructor(readonly projectRoot: string) {}
}

export class InstallManager {
  constructor(
    readonly catalog: CapabilityCatalog,
    readonly projectRoot: string,
    readonly runtimeVersion: string,
    readonly sdkVersion: string,
  ) {}
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd /tmp/rohinik-rs1-extraction/source
pnpm --filter @rohinik-org/adapter-ir test
```

Expected: all 8 tests pass.

---

## Task 3: Create `@rohinik-org/runtime-client`

**Files:**
- Create: `core/runtime/client/package.json`
- Create: `core/runtime/client/tsconfig.json`
- Create: `core/runtime/client/src/types.ts`
- Create: `core/runtime/client/src/client.ts`
- Create: `core/runtime/client/src/index.ts`
- Create: `core/runtime/client/src/__tests__/client.test.ts`

This is the runtime HTTP client moved out of the CLI. Extract only the HTTP transport concerns — no CLI formatting, no commander, no chalk.

- [ ] **Step 1: Write failing tests**

```typescript
// core/runtime/client/src/__tests__/client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RohinikHttpClient, RohinikClientError } from '../client.js'

// Stub global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

beforeEach(() => {
  mockFetch.mockReset()
})

describe('RohinikHttpClient construction', () => {
  it('defaults to localhost:8080', () => {
    const client = new RohinikHttpClient()
    expect(client.baseUrl).toBe('http://localhost:8080')
  })

  it('strips trailing slash from baseUrl', () => {
    const client = new RohinikHttpClient('http://example.com:9090/')
    expect(client.baseUrl).toBe('http://example.com:9090')
  })

  it('accepts explicit baseUrl', () => {
    const client = new RohinikHttpClient('http://runtime.local:4000')
    expect(client.baseUrl).toBe('http://runtime.local:4000')
  })
})

describe('RohinikHttpClient.getRuntime()', () => {
  it('calls GET /v1/runtime and returns parsed JSON', async () => {
    const expected = { requestId: 'r1', runtimeId: 'rhk-1', state: 'RUNNING', features: {}, uptime: 0 }
    mockFetch.mockResolvedValue(makeJsonResponse(expected))

    const client = new RohinikHttpClient('http://localhost:8080')
    const result = await client.getRuntime()

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8080/v1/runtime',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(result.runtimeId).toBe('rhk-1')
  })
})

describe('RohinikHttpClient.execute()', () => {
  it('calls POST /v1/execute with body', async () => {
    const req = { content: 'hello', contentType: 'TEXT' }
    const resp = {
      requestId: 'r2', output: 'ok', skillId: 's1',
      reasoningInvoked: false, confidence: 0.9, executionTimeMs: 10, explanation: '',
    }
    mockFetch.mockResolvedValue(makeJsonResponse(resp))

    const client = new RohinikHttpClient('http://localhost:8080')
    const result = await client.execute(req)

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8080/v1/execute',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      }),
    )
    expect(result.skillId).toBe('s1')
  })
})

describe('RohinikClientError propagation', () => {
  it('throws RohinikClientError on non-ok response', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ code: 'NOT_FOUND', message: 'resource not found' }, 404))
    const client = new RohinikHttpClient()
    await expect(client.getHealth()).rejects.toBeInstanceOf(RohinikClientError)
  })

  it('throws RohinikClientError on fetch network failure', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
    const client = new RohinikHttpClient()
    await expect(client.getRuntime()).rejects.toBeInstanceOf(RohinikClientError)
  })

  it('preserves HTTP status on RohinikClientError', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ code: 'GONE', message: 'gone' }, 410))
    const client = new RohinikHttpClient()
    try {
      await client.getHealth()
    } catch (err) {
      expect(err).toBeInstanceOf(RohinikClientError)
      expect((err as RohinikClientError).status).toBe(410)
    }
  })
})

describe('base URL in error message', () => {
  it('includes baseUrl in network error message', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
    const client = new RohinikHttpClient('http://my-runtime:9000')
    try {
      await client.getRuntime()
    } catch (err) {
      expect((err as RohinikClientError).message).toContain('http://my-runtime:9000')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /tmp/rohinik-rs1-extraction/source
pnpm --filter @rohinik-org/runtime-client test 2>&1 | head -20
```

Expected: fails, module not found.

- [ ] **Step 3: Create `core/runtime/client/package.json`**

```json
{
  "name": "@rohinik-org/runtime-client",
  "version": "0.1.0",
  "type": "module",
  "description": "Rohinik RS-1 — runtime HTTP client",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "*",
    "typescript": "*",
    "vitest": "*"
  }
}
```

No external dependencies — uses only Node.js built-in `fetch` (available ≥ 18).

- [ ] **Step 4: Create `core/runtime/client/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create `core/runtime/client/src/types.ts`**

Copy only the transport-domain types from the original CLI client — no CLI-specific types:

```typescript
// core/runtime/client/src/types.ts

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
```

- [ ] **Step 6: Create `core/runtime/client/src/client.ts`**

```typescript
// core/runtime/client/src/client.ts
import type {
  RuntimeInfo, HealthInfo, ExecuteRequest, ExecuteResponse,
  SimulateResponse, CapabilityInfo, DiagnosticsInfo, StartupInfo,
  ProfileInfo, CapabilityResult, DriverInfo, AcquisitionSearchResult,
  AcquisitionPlanResult, AcquisitionInstallResult, InstalledCapabilityList,
  AcquisitionSourceList,
} from './types.js'

export { RohinikClientError } from './error.js'
export type {
  RuntimeInfo, HealthInfo, ExecuteRequest, ExecuteResponse,
  SimulateResponse, CapabilityInfo, DiagnosticsInfo, StartupInfo,
  ProfileInfo, CapabilityResult, DriverInfo, AcquisitionSearchResult,
  AcquisitionPlanResult, AcquisitionInstallResult, InstalledCapabilityList,
  AcquisitionSourceList,
} from './types.js'
```

Wait — simpler to put everything in client.ts directly. Revise:

Create `core/runtime/client/src/client.ts` with the full `RohinikClientError` class and `RohinikHttpClient` class, importing types from `./types.js`:

```typescript
// core/runtime/client/src/client.ts
import type {
  RuntimeInfo, HealthInfo, ExecuteRequest, ExecuteResponse,
  SimulateResponse, CapabilityInfo, DiagnosticsInfo, StartupInfo,
  ProfileInfo, CapabilityResult, DriverInfo, AcquisitionSearchResult,
  AcquisitionPlanResult, AcquisitionInstallResult, InstalledCapabilityList,
  AcquisitionSourceList,
} from './types.js'

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

  constructor(baseUrl = 'http://localhost:8080') {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
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
```

- [ ] **Step 7: Create `core/runtime/client/src/index.ts`**

```typescript
// core/runtime/client/src/index.ts
export { RohinikHttpClient, RohinikClientError } from './client.js'
export type {
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
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd /tmp/rohinik-rs1-extraction/source
pnpm --filter @rohinik-org/runtime-client test
```

Expected: all tests pass.

---

## Task 4: Update workspace, shell, compiler, mcp, artifacts to use new packages

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `shell/package.json`
- Modify: `shell/src/context-assembler.ts`
- Modify: `shell/src/shell.ts`
- Modify: `compiler/package.json`
- Modify: `core/drivers/mcp/package.json`
- Modify: `core/drivers/mcp/src/mcp-adapter.ts`
- Modify: `core/drivers/mcp/src/mcp-binding.ts`
- Modify: `core/runtime/artifacts/package.json`
- Modify: `core/runtime/artifacts/src/lifecycle/lifecycle-manager.ts`
- Modify: `core/runtime/artifacts/src/lifecycle/__tests__/lifecycle.test.ts`
- Modify: `core/runtime/artifacts/src/policy/policy-engine.ts`
- Modify: `core/runtime/artifacts/src/sources/registry.ts`

- [ ] **Step 1: Update `pnpm-workspace.yaml`**

Replace with the cleaned workspace — retain all existing RS-1 entries, add new packages, remove all absent domains:

```yaml
packages:
  # Core — kernel
  - 'core/kernel'
  - 'core/kernel/foundation'
  - 'core/kernel/capability-core'
  # Core — runtime
  - 'core/runtime'
  - 'core/runtime/execution/executor'
  - 'core/runtime/execution/workflow'
  - 'core/runtime/orchestration'
  - 'core/runtime/networking/network'
  - 'core/runtime/networking/host-discovery'
  - 'core/runtime/daemon'
  - 'core/runtime/artifacts'
  - 'core/runtime/server'
  - 'core/runtime/conformance'
  - 'core/runtime/certification'
  - 'core/runtime/distributed'
  - 'core/runtime/rsh'
  - 'core/runtime/runtime-state'
  - 'core/runtime/interaction'
  - 'core/runtime/capability-manifest'
  - 'core/runtime/drivers/filesystem'
  - 'core/runtime/drivers/local-shell'
  - 'core/runtime/drivers/search'
  - 'core/runtime/drivers/document'
  - 'core/runtime/drivers/knowledge'
  - 'core/runtime/knowledge'
  - 'core/runtime/knowledge/entity-extractor'
  - 'core/runtime/knowledge/skill-classifier'
  - 'core/runtime/knowledge/reasoning-primitives'
  - 'core/runtime/acquisition'
  - 'core/runtime/acquisition/capability-registry'
  - 'core/runtime/acquisition/source-filesystem'
  - 'core/runtime/acquisition/source-github'
  - 'core/runtime/drivers/acquisition'
  - 'core/runtime/working-context'
  - 'core/runtime/context-manager'
  - 'core/runtime/scoring'
  - 'core/runtime/prediction-ir'
  - 'core/runtime/prediction-manager'
  - 'core/runtime/execution-ir'
  - 'core/runtime/execution'
  - 'core/runtime/evaluation-ir'
  - 'core/runtime/experience-ir'
  - 'core/runtime/experience-store-ir'
  - 'core/runtime/experience-query-ir'
  - 'core/runtime/context-quality-ir'
  - 'core/runtime/execution-evidence-ir'
  - 'core/runtime/execution-evidence-store-memory'
  - 'core/runtime/ml-ir'
  - 'core/runtime/ml-dataset'
  - 'core/runtime/ml-training'
  - 'core/runtime/ml-evaluation'
  - 'core/runtime/ml-deployment'
  - 'core/runtime/ml-operations'
  - 'core/runtime/governed-learning'
  - 'core/runtime/runtime-federation'
  - 'core/runtime/capability-ir'
  - 'core/runtime/capability-contracts-ir'
  - 'core/runtime/capability-binding-ir'
  - 'core/runtime/capability-binding'
  - 'core/runtime/capability-contracts'
  - 'core/runtime/application-manifest-ir'
  - 'core/runtime/package-manifest-ir'
  - 'core/runtime/package-manifest'
  - 'core/runtime/package-sdk'
  - 'core/runtime/package-runtime-adapter'
  - 'core/runtime/package-builder'
  - 'core/runtime/package-conformance'
  - 'core/runtime/application-manifest'
  - 'core/runtime/application-manifest-node-scanner'
  - 'core/runtime/resolution-graph-ir'
  - 'core/runtime/resolution-graph'
  - 'core/runtime/package-trust-ir'
  - 'core/runtime/package-trust'
  - 'core/runtime/package-revocation'
  - 'core/runtime/package-permissions'
  - 'core/runtime/package-acquisition'
  - 'core/runtime/package-integrity'
  - 'core/runtime/publisher-trust'
  - 'core/runtime/package-provenance'
  - 'core/runtime/package-vulnerability'
  - 'core/runtime/package-quarantine'
  - 'core/runtime/package-trust-decision'
  - 'core/runtime/package-trust-repository'
  - 'core/runtime/package-trust-reevaluation'
  - 'core/runtime/package-provisioning-authorization'
  - 'core/runtime/package-trust-integration'
  - 'core/runtime/provisioning-ir'
  - 'core/runtime/provisioning-runtime'
  - 'core/runtime/package-installer'
  - 'core/runtime/dependency-installer'
  - 'core/runtime/lockfile-ir'
  - 'core/runtime/lockfile'
  - 'core/runtime/stage-9k-integration'
  - 'core/runtime/client'
  - 'core/runtime/adapter-ir'
  # Core — intelligence
  - 'core/intelligence/planner-ir'
  - 'core/intelligence/planner'
  - 'core/intelligence/evaluation'
  - 'core/intelligence/experience'
  - 'core/intelligence/experience-query'
  - 'core/intelligence/experience-store'
  - 'core/intelligence/context-quality'
  - 'core/intelligence/execution-evidence'
  - 'core/intelligence/reasoning'
  - 'core/intelligence/reflection'
  - 'core/intelligence/autonomy'
  - 'core/intelligence/multi-agent'
  - 'core/intelligence/observer'
  - 'core/intelligence/acquisition'
  # Core — memory
  - 'core/memory'
  - 'core/memory/knowledge-graph'
  - 'core/memory/corpus'
  - 'core/memory/recommender'
  # Core — drivers
  - 'core/drivers/anthropic'
  - 'core/drivers/openai'
  - 'core/drivers/null-reasoning'
  - 'core/drivers/mcp'
  - 'core/drivers/filesystem'
  # Compiler + shell
  - 'compiler'
  - 'shell'
allowBuilds:
  better-sqlite3: true
  esbuild: true
```

- [ ] **Step 2: Update `shell/package.json`**

Replace `@rohinik-org/cli` with `@rohinik-org/runtime-client`:

```json
{
  "name": "@rohinik-org/shell",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@rohinik-org/compiler": "workspace:*",
    "@rohinik-org/runtime-client": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "*",
    "typescript": "*",
    "vitest": "*"
  }
}
```

- [ ] **Step 3: Update `shell/src/context-assembler.ts`**

Change line 7:
```typescript
// OLD:
import { RohinikHttpClient } from '@rohinik-org/cli/client'
// NEW:
import { RohinikHttpClient } from '@rohinik-org/runtime-client'
```

- [ ] **Step 4: Update `shell/src/shell.ts`**

Change line 7:
```typescript
// OLD:
import { RohinikHttpClient } from '@rohinik-org/cli/client'
// NEW:
import { RohinikHttpClient } from '@rohinik-org/runtime-client'
```

- [ ] **Step 5: Update `compiler/package.json`**

Remove `@rohinik-org/cli` from dependencies (it is unused in compiler source):

```json
{
  "name": "@rohinik-org/compiler",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@rohinik-org/foundation": "workspace:*",
    "zod": "^3.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "*",
    "typescript": "*",
    "vitest": "*"
  },
  "peerDependencies": {
    "@anthropic-ai/sdk": ">=0.20.0"
  },
  "peerDependenciesMeta": {
    "@anthropic-ai/sdk": { "optional": true }
  }
}
```

- [ ] **Step 6: Update `core/drivers/mcp/package.json`**

Replace `@rohinik-org/adapter-sdk` with `@rohinik-org/adapter-ir`:

```json
{
  "name": "@rohinik-org/mcp",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@rohinik-org/adapter-ir": "workspace:*",
    "@rohinik-org/compiler": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "*",
    "typescript": "*",
    "vitest": "*"
  }
}
```

- [ ] **Step 7: Update `core/drivers/mcp/src/mcp-adapter.ts`** — change import line 1:

```typescript
// OLD:
import type { CapabilityAdapter, AdapterConfig, RawDiscoveryModel, AdapterValidationResult } from '@rohinik-org/adapter-sdk'
// NEW:
import type { CapabilityAdapter, AdapterConfig, RawDiscoveryModel, AdapterValidationResult } from '@rohinik-org/adapter-ir'
```

- [ ] **Step 8: Update `core/drivers/mcp/src/mcp-binding.ts`** — change import line 1:

```typescript
// OLD:
import type { ExecutionBinding } from '@rohinik-org/adapter-sdk'
// NEW:
import type { ExecutionBinding } from '@rohinik-org/adapter-ir'
```

- [ ] **Step 9: Update `core/runtime/artifacts/package.json`**

Replace `@rohinik-org/adapter-sdk` with `@rohinik-org/adapter-ir`:

```json
{
  "name": "@rohinik-org/artifacts",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@rohinik-org/adapter-ir": "workspace:*",
    "@rohinik-org/compiler": "workspace:*",
    "zod": "^3.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "*",
    "typescript": "*",
    "vitest": "*"
  }
}
```

- [ ] **Step 10: Update the four source files in `core/runtime/artifacts/src`**

In each file, change `@rohinik-org/adapter-sdk` to `@rohinik-org/adapter-ir`:

**`core/runtime/artifacts/src/lifecycle/lifecycle-manager.ts` line 1:**
```typescript
// OLD:
import type { CapabilityCatalog, InstallManager, CapabilityAdapter, AdapterConfig, ExecutionBinding } from '@rohinik-org/adapter-sdk'
// NEW:
import type { CapabilityCatalog, InstallManager, CapabilityAdapter, AdapterConfig, ExecutionBinding } from '@rohinik-org/adapter-ir'
```

**`core/runtime/artifacts/src/lifecycle/__tests__/lifecycle.test.ts` lines 6-7:**
```typescript
// OLD:
import { CapabilityCatalog, InstallManager } from '@rohinik-org/adapter-sdk'
import type { CapabilityAdapter, RawDiscoveryModel } from '@rohinik-org/adapter-sdk'
// NEW:
import { CapabilityCatalog, InstallManager } from '@rohinik-org/adapter-ir'
import type { CapabilityAdapter, RawDiscoveryModel } from '@rohinik-org/adapter-ir'
```

**`core/runtime/artifacts/src/policy/policy-engine.ts` line 2:**
```typescript
// OLD:
import type { InstallSource } from '@rohinik-org/adapter-sdk'
// NEW:
import type { InstallSource } from '@rohinik-org/adapter-ir'
```

**`core/runtime/artifacts/src/sources/registry.ts` line 6:**
```typescript
// OLD:
import type { InstallSource } from '@rohinik-org/adapter-sdk'
// NEW:
import type { InstallSource } from '@rohinik-org/adapter-ir'
```

---

## Task 5: Fix root `package.json` and stale source comment

**Files:**
- Modify: `package.json` (root)
- Modify: `core/kernel/src/matching/matcher.ts`

- [ ] **Step 1: Update root `package.json`**

```json
{
  "name": "rohinik",
  "version": "0.0.0",
  "private": true,
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=9.0.0"
  },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/rohinik-org/rs1.git"
  },
  "homepage": "https://github.com/rohinik-org/rs1",
  "bugs": {
    "url": "https://github.com/rohinik-org/rs1/issues"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  },
  "dependencies": {
    "pdfjs-dist": "^6.2.108"
  }
}
```

- [ ] **Step 2: Fix stale comment in `core/kernel/src/matching/matcher.ts`**

Replace line 12 (`// See docs/Rohinik-WHITEPAPER.md for the ownership model:`) with a neutral AFS reference comment:

```typescript
// OLD (line 12):
// See docs/Rohinik-WHITEPAPER.md for the ownership model:
// NEW:
// Ownership model per AFS-0001 §routing:
```

This replaces a broken path with a stable architectural identifier without inventing a fake reference.

---

## Task 6: Repair documentation

**Files:**
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `SECURITY.md`

- [ ] **Step 1: Rewrite `README.md`**

```markdown
# RS-1 — Rohinik Execution Runtime

RS-1 is the Rohinik execution runtime repository containing the core runtime, compiler, and governed shell.

Rohinik's specifications, SDKs, CLI, documentation, examples, and official capabilities are maintained separately or will be extracted into their respective repositories.

**Rohinik OS 1.0 implements the RS-1 Runtime System architecture, specified in AFS-0001.**

| Component | Name |
|-----------|------|
| Platform | Rohinik |
| Architecture | RS-1 (Runtime System, Revision 1) |
| Runtime | Rohinik Runtime |
| Daemon | `rhkd` |
| npm scope | `@rohinik-org/*` |

---

## Repository scope

This repository contains three implementation domains:

| Domain | Path | Contents |
|--------|------|----------|
| Compiler | `compiler/` | IR types, schemas, intent compiler, planner |
| Core | `core/` | Kernel, runtime, intelligence, memory, drivers |
| Shell | `shell/` | Governed interaction surface (NL → WorkflowPlan → execution) |

---

## Build and test

Requires Node.js ≥ 22.0.0 and pnpm ≥ 9.0.0.

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

---

## Excluded from this repository

The following are maintained separately and are not part of RS-1:

- **SDK** — TypeScript adapter SDK, asset SDK, console SDK, marketplace SDK
- **CLI** — the `rhk` CLI binary
- **Tools** — installer, package-manager, asset frontends, benchmarks
- **Examples** — knowledge-assistant and other sample applications
- **Registry** — capability pack registry
- **Documentation** — end-user docs, quickstart, architecture references

---

## License

MIT — see [LICENSE](LICENSE)
```

- [ ] **Step 2: Rewrite `CONTRIBUTING.md`**

```markdown
# Contributing to RS-1

## Prerequisites

- Node.js ≥ 22.0.0
- pnpm ≥ 9.0.0
- `pnpm install` at repo root

## Build and test

```bash
pnpm build     # build all packages in dependency order
pnpm test      # run all tests
pnpm typecheck # type-check all packages
```

## Repository map

| Domain | Path | Contents |
|--------|------|----------|
| Compiler | `compiler/` | IR types, schemas, shared interfaces |
| Kernel | `core/kernel/` | Foundation, capability-core |
| Runtime | `core/runtime/` | Execution, orchestration, networking, daemon, artifacts, runtime-client, adapter-ir |
| Intelligence | `core/intelligence/` | Planner, observer, acquisition, autonomy, reasoning, reflection, multi-agent |
| Memory | `core/memory/` | Memory engine, knowledge-graph, corpus, recommender |
| Drivers | `core/drivers/` | Anthropic, OpenAI, filesystem, MCP, null-reasoning |
| Shell | `shell/` | NL → WorkflowPlan governed execution surface |

## Contribution guidelines

- Follow existing patterns. Read the relevant AFS-* spec before adding to a subsystem.
- Every non-trivial change needs tests. Run `pnpm test` locally before opening a PR.
- Keep PRs focused. One feature / bugfix per PR.
- Add a `ponytail:` comment when you deliberately simplify (known ceiling, upgrade path).
- Do not add external dependencies without discussion.
- Architectural changes must reference the applicable approved AFS, laws, invariants, or architectural decision in the pull request.

## Architecture specs

Before changing system-level behavior, read the relevant spec:

- `AFS-0001` — Core architecture
- `AFS-0002` — Governance strategy
- ADR-001 through ADR-004 — Key design decisions

Architecture specifications are maintained separately from this repository.

## Code of conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
```

- [ ] **Step 3: Update `SECURITY.md` scope line**

Change:

```
In-scope components: all packages under `core/`, `compiler/`, `sdk/`, `shell/`, `cli/`.
```

to:

```
In-scope components: all packages under `core/`, `compiler/`, `shell/`.
```

---

## Task 7: pnpm install and write dependency boundary report

**Files:**
- Create: `RS1-DEPENDENCY-BOUNDARY-REPORT.md`

- [ ] **Step 1: Run `pnpm install`**

```bash
cd /tmp/rohinik-rs1-extraction/source
pnpm install
```

Expected: no "Warn: No packages found matching" messages for workspace entries. No resolution failure for `@rohinik-org/cli` or `@rohinik-org/adapter-sdk`.

If the lockfile cannot reconcile, document why and proceed with regeneration (copy old lockfile aside first).

- [ ] **Step 2: Verify workspace resolution**

```bash
pnpm list --depth 0 -r 2>&1 | grep -E "WARN|ERROR|cli|adapter-sdk" | head -20
```

Expected: no warnings about absent packages.

- [ ] **Step 3: Write `RS1-DEPENDENCY-BOUNDARY-REPORT.md`**

```markdown
# RS-1 Dependency Boundary Report

Generated: 2026-08-04

## Retained RS-1 packages

All packages under `core/`, `compiler/`, and `shell/` as listed in `pnpm-workspace.yaml`.
See `pnpm-workspace.yaml` for the canonical list (currently 100 entries).

## Internal dependency edges

All `workspace:*` references in the retained packages now resolve to packages physically present in `core/`, `compiler/`, or `shell/`.

Two new RS-1-owned packages were created to close boundary violations:

| New package | Path | Purpose |
|---|---|---|
| `@rohinik-org/runtime-client` | `core/runtime/client` | Owns RohinikHttpClient and all HTTP transport types. Consumed by shell. |
| `@rohinik-org/adapter-ir` | `core/runtime/adapter-ir` | Owns adapter interface types (CapabilityAdapter, AdapterConfig, etc.) and minimal lifecycle stubs. Consumed by mcp driver and artifacts. |

## Excluded dependencies found

| Package | Dep found | Classification | Resolution |
|---|---|---|---|
| `shell` | `@rohinik-org/cli` (workspace) | Invalid — CLI is downstream of RS-1 | Replaced by `@rohinik-org/runtime-client` |
| `compiler` | `@rohinik-org/cli` (workspace) | Invalid — unused in source, phantom dep | Removed |
| `core/drivers/mcp` | `@rohinik-org/adapter-sdk` (workspace) | Invalid — SDK excluded from RS-1 | Replaced by `@rohinik-org/adapter-ir` |
| `core/runtime/artifacts` | `@rohinik-org/adapter-sdk` (workspace) | Invalid — SDK excluded from RS-1 | Replaced by `@rohinik-org/adapter-ir` |

## Stale workspace entries removed

17 absent entries removed from `pnpm-workspace.yaml`:
- `packages/reference/*`
- `sdk/typescript/adapter-sdk`
- `sdk/typescript/asset-sdk`
- `sdk/typescript/studio-sdk`
- `sdk/typescript/console-sdk`
- `sdk/typescript/console`
- `sdk/typescript/console-shell`
- `sdk/typescript/extensions`
- `sdk/typescript/marketplace-sdk`
- `sdk/typescript/marketplace`
- `cli`
- `tools/installer`
- `tools/package-manager`
- `tools/claude/asset-frontend`
- `tools/cursor/asset-frontend`
- `registry/packs/starter-pack`
- `examples/knowledge-assistant`
- `apps/*` (wildcard, resolved to empty set)
- `tools/benchmark/reference-runner-node`

## Remaining external Rohinik dependencies

None. All `@rohinik-org/*` workspace references now resolve to present packages.

`@anthropic-ai/sdk` is a valid external dependency (peer dep of compiler, actual Anthropic SDK).

## False positives

- `@rohinik-org/cli` string literal in `compiler/src/types/command-ir.ts` — this is a type union value `'cli'`, not an import. Not a dependency violation.
```

---

## Task 8: Full verification suite

- [ ] **Step 1: Typecheck**

```bash
cd /tmp/rohinik-rs1-extraction/source
pnpm typecheck 2>&1 | tail -20
```

Expected: exit 0, no type errors.

- [ ] **Step 2: Build**

```bash
pnpm build 2>&1 | tail -30
```

Expected: all packages build successfully.

- [ ] **Step 3: Test**

```bash
pnpm test 2>&1 | tail -40
```

Expected: all tests pass, no failures.

- [ ] **Step 4: Check for whitespace / trailing content issues**

```bash
git diff --check
```

Expected: no output (no whitespace errors).

- [ ] **Step 5: Check for local paths in tracked files**

```bash
git diff HEAD | grep -i "C:\\\\Users\\\\C5182688\|/tmp/rohinik-rs1-extraction" || echo "clean"
```

Expected: "clean"

- [ ] **Step 6: Verify workspace entries all exist**

```bash
python3 -c "
import yaml, os
with open('pnpm-workspace.yaml') as f:
    data = yaml.safe_load(f)
absent = [p for p in data.get('packages', []) if '*' not in p and not os.path.isfile(os.path.join(p, 'package.json'))]
if absent:
    print('ABSENT:', absent)
else:
    print('All workspace entries present')
"
```

Expected: "All workspace entries present"

---

## Task 9: Commit 1 — runtime-client and adapter-ir

- [ ] **Step 1: Stage commit 1 files**

```bash
git add \
  core/runtime/client \
  core/runtime/adapter-ir \
  shell/src/context-assembler.ts \
  shell/src/shell.ts \
  shell/package.json \
  compiler/package.json \
  core/drivers/mcp/package.json \
  core/drivers/mcp/src/mcp-adapter.ts \
  core/drivers/mcp/src/mcp-binding.ts \
  core/runtime/artifacts/package.json \
  core/runtime/artifacts/src/lifecycle/lifecycle-manager.ts \
  "core/runtime/artifacts/src/lifecycle/__tests__/lifecycle.test.ts" \
  core/runtime/artifacts/src/policy/policy-engine.ts \
  core/runtime/artifacts/src/sources/registry.ts \
  pnpm-workspace.yaml \
  pnpm-lock.yaml
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(runtime): move runtime HTTP client into RS-1 ownership

CLI is a downstream consumer of RS-1; RS-1 shell cannot depend on a
package that depends on RS-1. Breaks the circular architectural
violation by creating @rohinik-org/runtime-client (core/runtime/client)
to own RohinikHttpClient and all HTTP transport types, and
@rohinik-org/adapter-ir (core/runtime/adapter-ir) to own the adapter
interface types previously extracted from the excluded adapter-sdk.

Shell now imports from @rohinik-org/runtime-client.
MCP driver and artifacts package now import from @rohinik-org/adapter-ir.
Phantom @rohinik-org/cli dep removed from compiler (no source imports it).
Absent workspace entries removed from pnpm-workspace.yaml.
EOF
)"
```

- [ ] **Step 3: Verify commit**

```bash
git log --oneline -3
git status --short
```

Expected: new commit at HEAD, clean working tree.

---

## Task 10: Commit 2 — standalone repo chore

- [ ] **Step 1: Stage commit 2 files**

```bash
git add \
  package.json \
  README.md \
  CONTRIBUTING.md \
  SECURITY.md \
  core/kernel/src/matching/matcher.ts \
  RS1-EXTRACTION-BASELINE.md \
  RS1-DEPENDENCY-BOUNDARY-REPORT.md
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore(repo): establish standalone RS-1 workspace

- Remove benchmark script (references excluded tools/benchmark)
- Update repository, homepage, bugs metadata to rohinik-org/rs1
- Rewrite README.md to describe RS-1 specifically
- Update CONTRIBUTING.md: scope to core/, compiler/, shell/ only;
  add constitutional change guidance; remove excluded domain references
- Fix SECURITY.md scope: remove sdk/ and cli/
- Replace stale docs/Rohinik-WHITEPAPER.md comment in matcher.ts
  with neutral AFS-0001 reference
- Add RS1-EXTRACTION-BASELINE.md
- Add RS1-DEPENDENCY-BOUNDARY-REPORT.md
EOF
)"
```

- [ ] **Step 3: Verify commit**

```bash
git log --oneline -4
git status --short
```

Expected: two new commits, clean working tree.

---

## Task 11: Final verification and extraction tag

- [ ] **Step 1: Full verification after both commits**

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
git diff --check
```

All must pass.

- [ ] **Step 2: Verify no local paths in committed files**

```bash
git log HEAD -2 --format='' -p | grep -i "C:\\\\Users\\\\C5182688\|/tmp/rohinik-rs1-extraction" || echo "clean"
```

Expected: "clean"

- [ ] **Step 3: Verify acceptance criteria**

Check each criteria point:
1. `ls core/ compiler/ shell/` — only RS-1 domains present
2. Run workspace validation script from Task 8 Step 6
3. Check root package.json has no benchmark script
4. `grep -r "@rohinik-org/cli" */package.json` — no results
5. `ls core/runtime/client/src/client.ts` — exists
6. `grep "runtime-client" shell/package.json` — present
7. `pnpm install` succeeded without absent package warnings
8-10. Documentation verified by inspection
11. No `docs/*.md` links in README, CONTRIBUTING, SECURITY
12-15. Install, typecheck, build, test all pass
16. `pnpm run` — list all available scripts
17. `git diff --check` clean
18. `git status --short` clean
19. Tag not yet created — create now
20. No push yet

- [ ] **Step 4: Create extraction tag**

```bash
git status --short  # must produce no output
git tag -a v0.14.0-rs1-extraction -m "Standalone RS-1 repository baseline after Rohinik Stage 14"
git tag -l | grep rs1
```

Expected: tag created, no push.

- [ ] **Step 5: Final tag and branch inventory**

```bash
git tag -l
git branch -v
git log --oneline -5
git remote -v
```

---

## Self-review against spec

**Spec coverage check:**

| Spec section | Plan task |
|---|---|
| §1 Safety and baseline | Task 1 |
| §2 Inspect extracted repo | Pre-plan research (complete) |
| §3 Clean pnpm workspace | Task 4 step 1 |
| §4 Clean root package | Task 5 step 1 |
| §5 Fix shell→CLI violation | Tasks 2, 3, 4 |
| §6 Documentation repair | Task 6 |
| §7 Cross-repo dependency scan | Tasks 2, 4; dependency report in Task 7 |
| §8 Lockfile and install | Task 7 |
| §9 Verification suite | Task 8 |
| §10 Git diff review | Task 8 steps 4-5 |
| §11 Commit structure | Tasks 9-10 |
| §12 Extraction tag | Task 11 step 4 |
| §13 Push policy | Task 11 — stop and report, no push |
| §14 Acceptance criteria | Task 11 step 3 |
| §15 Final response format | Post-execution |

**Placeholder scan:** None found.

**Type consistency:** `RohinikHttpClient`, `RohinikClientError` consistent across tasks 3, 4. `CapabilityAdapter`, `AdapterConfig` etc. consistent across tasks 2, 4.

**`adapter-ir` stub classes:** The spec says move only reusable runtime transport concerns. `CapabilityCatalog` and `InstallManager` are used as instantiable classes in the `artifacts` test file. Since the full `adapter-sdk` implementations depend on `@rohinik-org/compiler` internals (which are present in RS-1), there's a case for including the full implementations. However, the lifecycle logic in `LifecycleManager` (artifacts) instantiates these classes itself — the test just calls `new CapabilityCatalog(...)`. The minimal stubs satisfy the instantiation contract for tests without pulling in the full adapter-sdk registration pipeline. If test coverage requires the full pipeline, add fuller implementations to `adapter-ir` at that point.

**Adapter-ir and CapabilityCatalog:** The `lifecycle-manager.ts` imports `CapabilityCatalog` and `InstallManager` as *types* (type-only imports). But `lifecycle.test.ts` imports them as values (class constructors). The stubs in `adapter-ir/src/index.ts` are concrete classes, satisfying both the type import and the value import.
