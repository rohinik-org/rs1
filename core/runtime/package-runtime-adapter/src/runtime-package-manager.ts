import type { PackageDefinition } from '@rohinik-org/package-sdk'
import type { ProviderDefinition } from '@rohinik-org/package-sdk'

// ─── Lifecycle hook ports (no ownership — RuntimeHost remains authority) ──────

export interface StartupContext {
  readonly packageId: string
  readonly getSecret: (name: string) => Promise<string | undefined>
  readonly getEnv: (name: string) => string | undefined
  readonly log: (level: 'info' | 'warn' | 'error', message: string) => void
}

export interface ShutdownContext {
  readonly packageId: string
  readonly log: (level: 'info' | 'warn' | 'error', message: string) => void
}

export interface ProviderHooks {
  readonly onStart?: (ctx: StartupContext) => Promise<void>
  readonly onStop?: (ctx: ShutdownContext) => Promise<void>
  readonly isReady?: () => boolean
  readonly isLive?: () => boolean
}

// ─── Authorization gate port ─────────────────────────────────────────────────

export interface AuthorizationGate {
  readonly isAuthorized: (packageId: string) => boolean
}

// ─── Lifecycle event ─────────────────────────────────────────────────────────

export type LifecycleEventType =
  | 'registered'
  | 'startup-started'
  | 'startup-completed'
  | 'startup-failed'
  | 'startup-rolled-back'
  | 'shutdown-started'
  | 'shutdown-completed'

export interface LifecycleEvent {
  readonly packageId: string
  readonly eventType: LifecycleEventType
  readonly occurredAt: string
  readonly error?: string
}

// ─── Registration entry ───────────────────────────────────────────────────────

export interface PackageRegistration {
  readonly packageDefinition: PackageDefinition
  readonly providerDefinition: ProviderDefinition
  readonly hooks: ProviderHooks
}

// ─── Registered entry (internal state) ───────────────────────────────────────

type RegistrationState = 'registered' | 'started' | 'failed' | 'stopped'

interface RegisteredEntry {
  readonly registration: PackageRegistration
  state: RegistrationState
}

// ─── RuntimePackageManager ───────────────────────────────────────────────────

export class RuntimePackageManager {
  private readonly entries = new Map<string, RegisteredEntry>()
  private readonly events: LifecycleEvent[] = []

  constructor(
    private readonly authGate: AuthorizationGate,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  register(registration: PackageRegistration): void {
    const id = registration.packageDefinition.package.id
    if (this.entries.has(id)) {
      throw Object.assign(
        new Error(`validation-failed: package "${id}" already registered`),
        { code: 'validation-failed' as const },
      )
    }
    this.entries.set(id, { registration, state: 'registered' })
    this.emit(id, 'registered')
  }

  async startPackage(packageId: string, ctx: StartupContext): Promise<void> {
    const entry = this.entries.get(packageId)
    if (!entry) {
      throw Object.assign(
        new Error(`invalid-input: package "${packageId}" not registered`),
        { code: 'invalid-input' as const },
      )
    }

    // L-9K-002: authorization required before startup
    if (!this.authGate.isAuthorized(packageId)) {
      throw Object.assign(
        new Error(`authorization-required: package "${packageId}" not authorized for startup`),
        { code: 'authorization-required' as const },
      )
    }

    this.emit(packageId, 'startup-started')
    try {
      const hook = entry.registration.hooks.onStart
      if (hook) await hook(ctx)
      entry.state = 'started'
      this.emit(packageId, 'startup-completed')
    } catch (err) {
      entry.state = 'failed'
      this.emit(packageId, 'startup-failed', String(err))
      // Rollback: attempt shutdown to clean up partial state
      await this.rollback(packageId, ctx)
      throw err
    }
  }

  async stopPackage(packageId: string, ctx: ShutdownContext): Promise<void> {
    const entry = this.entries.get(packageId)
    // Idempotent: if not started or already stopped, no-op
    if (!entry || entry.state === 'stopped') return

    this.emit(packageId, 'shutdown-started')
    try {
      const hook = entry.registration.hooks.onStop
      if (hook) await hook(ctx)
    } finally {
      // Idempotent — mark stopped even if hook throws
      entry.state = 'stopped'
      this.emit(packageId, 'shutdown-completed')
    }
  }

  isReady(packageId: string): boolean {
    const entry = this.entries.get(packageId)
    if (!entry || entry.state !== 'started') return false
    return entry.registration.hooks.isReady?.() ?? true
  }

  isLive(packageId: string): boolean {
    const entry = this.entries.get(packageId)
    if (!entry || entry.state !== 'started') return false
    return entry.registration.hooks.isLive?.() ?? true
  }

  drainEvents(): readonly LifecycleEvent[] {
    return [...this.events]
  }

  private async rollback(packageId: string, ctx: StartupContext): Promise<void> {
    const entry = this.entries.get(packageId)
    if (!entry) return
    const shutdownCtx: ShutdownContext = { packageId, log: ctx.log }
    this.emit(packageId, 'startup-rolled-back')
    try {
      const hook = entry.registration.hooks.onStop
      if (hook) await hook(shutdownCtx)
    } catch {
      // rollback is best-effort
    }
  }

  private emit(packageId: string, eventType: LifecycleEventType, error?: string): void {
    this.events.push(
      Object.freeze({ packageId, eventType, occurredAt: this.clock(), ...(error ? { error } : {}) }),
    )
  }
}
