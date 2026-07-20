import type { KernelRuntime, AiosRouter } from '@rohinik-org/kernel'
import type { RuntimeServices } from '@rohinik-org/kernel'
import type { ResolvedConfig } from '../types.js'
import type { BootstrapPlan } from './bootstrap-plan.js'
import type { IdentityService } from '../identity/identity-service.js'

// ── Live context (pipeline-internal, discarded after bootstrap) ──────────────

export interface BootstrapContext {
  readonly config: ResolvedConfig
  readonly plan: BootstrapPlan
  readonly services: RuntimeServices
  readonly runtime: KernelRuntime
  readonly router: AiosRouter
  readonly providers: ProviderCatalog
  readonly diagnostics: DiagnosticsCollector
  readonly startupId: string
}

// ── Immutable metadata (stored on RuntimeHost, survives shutdown) ─────────────

export interface BootstrapMetadata {
  readonly startupId: string
  readonly durationMs: number
  readonly startupTimeline: ReadonlyArray<StageTimingEntry>
  readonly diagnostics: ReadonlyArray<DiagnosticEntry>
  readonly warnings: ReadonlyArray<string>
  readonly servicesStarted: ReadonlyArray<string>
  readonly extensionsLoaded: number
  readonly providersLoaded: number
  readonly capabilitiesLoaded: number
  readonly builtinsLoaded: number
  readonly providers: ReadonlyArray<ProviderEntry>
}

export interface StageTimingEntry {
  readonly stageName: string
  readonly timestampStart: number
  readonly timestampEnd: number
  readonly durationMs: number
  readonly status: 'ok' | 'warn' | 'skipped'
}

// ── Pipeline result ───────────────────────────────────────────────────────────

export interface BootstrapResult {
  readonly metadata: BootstrapMetadata
  readonly runtime: KernelRuntime
  readonly router: AiosRouter
  readonly identity: IdentityService
}

// ── ProviderCatalog (pipeline-only) ──────────────────────────────────────────

export interface ProviderEntry {
  readonly id: string
  readonly name: string
  readonly status: 'HEALTHY' | 'UNAVAILABLE'
}

export interface ProviderCatalog {
  register(entry: ProviderEntry): void
  list(): ReadonlyArray<ProviderEntry>
  find(id: string): ProviderEntry | undefined
}

export class InMemoryProviderCatalog implements ProviderCatalog {
  private readonly entries: ProviderEntry[] = []

  register(entry: ProviderEntry): void {
    this.entries.push(entry)
  }

  list(): ReadonlyArray<ProviderEntry> {
    return this.entries
  }

  find(id: string): ProviderEntry | undefined {
    return this.entries.find(e => e.id === id)
  }
}

// ── DiagnosticsCollector ──────────────────────────────────────────────────────

export interface DiagnosticEntry {
  readonly severity: 'WARN' | 'ERROR'
  readonly code: string
  readonly message: string
  readonly data?: unknown
}

export interface DiagnosticsCollector {
  warn(code: string, message: string, data?: unknown): void
  error(code: string, message: string, data?: unknown): void
  all(): ReadonlyArray<DiagnosticEntry>
  hasErrors(): boolean
}

export class DefaultDiagnosticsCollector implements DiagnosticsCollector {
  private readonly entries: DiagnosticEntry[] = []

  warn(code: string, message: string, data?: unknown): void {
    this.entries.push({ severity: 'WARN', code, message, data })
  }

  error(code: string, message: string, data?: unknown): void {
    this.entries.push({ severity: 'ERROR', code, message, data })
  }

  all(): ReadonlyArray<DiagnosticEntry> {
    return this.entries
  }

  hasErrors(): boolean {
    return this.entries.some(e => e.severity === 'ERROR')
  }
}

// ── Health types (used by RuntimeHost.health()) ───────────────────────────────

export interface HealthReport {
  readonly startupId: string | undefined
  readonly status: 'healthy' | 'degraded' | 'unavailable'
  readonly checks: ReadonlyArray<HealthCheckEntry>
  readonly timestamp: number
}

export interface HealthCheckEntry {
  readonly subsystem: string
  readonly status: 'healthy' | 'degraded' | 'unavailable'
  readonly data?: unknown
  readonly durationMs?: number
}

export interface RuntimeProfile {
  readonly runtimeId: string
  readonly version: string
  readonly uptimeMs: number
  readonly capabilities: ReadonlyArray<{ skillId: string; tierId: string }>
  readonly providers: ReadonlyArray<ProviderEntry>
  readonly servicesStarted: ReadonlyArray<string>
  readonly extensionsLoaded: number
  readonly builtinsLoaded: number
  readonly startupDurationMs: number
  readonly startupTimeline: ReadonlyArray<StageTimingEntry>
  readonly diagnosticSummary: { readonly warnings: number; readonly errors: number }
}
