import { describe, it, expect, vi } from 'vitest'
import { RuntimePackageManager } from '../runtime-package-manager.js'
import type { PackageRegistration, StartupContext, ShutdownContext, AuthorizationGate } from '../runtime-package-manager.js'
import { definePackage, defineProvider, provideCapability } from '@rohinik-org/package-sdk'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRegistration(id = 'com.example.pkg', hooks: ConstructorParameters<typeof Object>[0] = {}): PackageRegistration {
  const pkg = definePackage({
    package: { id, name: 'Pkg', version: '1.0.0', type: 'capability-provider' },
    provides: [{ capability: 'com:example:greet', version: '1.0.0' }],
  })
  const provider = defineProvider({
    packageDefinition: pkg,
    capabilities: [provideCapability('com:example:greet', '1.0.0')],
  })
  return { packageDefinition: pkg, providerDefinition: provider, hooks }
}

function makeCtx(packageId = 'com.example.pkg'): StartupContext {
  return { packageId, getSecret: async () => undefined, getEnv: () => undefined, log: () => {} }
}

function makeShutdownCtx(packageId = 'com.example.pkg'): ShutdownContext {
  return { packageId, log: () => {} }
}

const ALLOW_ALL: AuthorizationGate = { isAuthorized: () => true }
const DENY_ALL: AuthorizationGate = { isAuthorized: () => false }

// ─── Registration ─────────────────────────────────────────────────────────────

describe('registration', () => {
  it('registers a package successfully', () => {
    const mgr = new RuntimePackageManager(ALLOW_ALL)
    mgr.register(makeRegistration())
    const events = mgr.drainEvents()
    expect(events.some((e) => e.eventType === 'registered')).toBe(true)
  })

  it('duplicate registration fails with validation-failed', () => {
    const mgr = new RuntimePackageManager(ALLOW_ALL)
    mgr.register(makeRegistration())
    let err: unknown
    try { mgr.register(makeRegistration()) } catch (e) { err = e }
    expect((err as { code: string }).code).toBe('validation-failed')
  })
})

// ─── Readiness ────────────────────────────────────────────────────────────────

describe('readiness', () => {
  it('readiness is false before startup', () => {
    const mgr = new RuntimePackageManager(ALLOW_ALL)
    mgr.register(makeRegistration())
    expect(mgr.isReady('com.example.pkg')).toBe(false)
  })

  it('readiness is true after successful startup', async () => {
    const mgr = new RuntimePackageManager(ALLOW_ALL)
    mgr.register(makeRegistration())
    await mgr.startPackage('com.example.pkg', makeCtx())
    expect(mgr.isReady('com.example.pkg')).toBe(true)
  })
})

// ─── Authorization gate ───────────────────────────────────────────────────────

describe('authorization gate (L-9K-002)', () => {
  it('startup requires authorization', async () => {
    const mgr = new RuntimePackageManager(DENY_ALL)
    mgr.register(makeRegistration())
    let err: unknown
    try { await mgr.startPackage('com.example.pkg', makeCtx()) } catch (e) { err = e }
    expect((err as { code: string }).code).toBe('authorization-required')
  })

  it('package code does not run before authorization', async () => {
    const onStart = vi.fn()
    const mgr = new RuntimePackageManager(DENY_ALL)
    mgr.register(makeRegistration('com.example.pkg', { onStart }))
    try { await mgr.startPackage('com.example.pkg', makeCtx()) } catch { /* expected */ }
    expect(onStart).not.toHaveBeenCalled()
  })
})

// ─── Startup ordering ─────────────────────────────────────────────────────────

describe('startup ordering', () => {
  it('startup events are deterministic: started → completed', async () => {
    const mgr = new RuntimePackageManager(ALLOW_ALL)
    mgr.register(makeRegistration())
    await mgr.startPackage('com.example.pkg', makeCtx())
    const events = mgr.drainEvents().filter((e) => e.packageId === 'com.example.pkg')
    const types = events.map((e) => e.eventType)
    expect(types).toContain('startup-started')
    expect(types).toContain('startup-completed')
    expect(types.indexOf('startup-started')).toBeLessThan(types.indexOf('startup-completed'))
  })
})

// ─── Rollback ────────────────────────────────────────────────────────────────

describe('rollback', () => {
  it('startup failure triggers rollback event', async () => {
    const onStart = vi.fn().mockRejectedValue(new Error('startup boom'))
    const onStop = vi.fn().mockResolvedValue(undefined)
    const mgr = new RuntimePackageManager(ALLOW_ALL)
    mgr.register(makeRegistration('com.example.pkg', { onStart, onStop }))
    try { await mgr.startPackage('com.example.pkg', makeCtx()) } catch { /* expected */ }
    const events = mgr.drainEvents()
    expect(events.some((e) => e.eventType === 'startup-failed')).toBe(true)
    expect(events.some((e) => e.eventType === 'startup-rolled-back')).toBe(true)
    expect(onStop).toHaveBeenCalled()
  })
})

// ─── Shutdown idempotency ─────────────────────────────────────────────────────

describe('shutdown', () => {
  it('shutdown works without prior startup (idempotent)', async () => {
    const mgr = new RuntimePackageManager(ALLOW_ALL)
    mgr.register(makeRegistration())
    // No startup — shutdown should be a no-op
    await expect(mgr.stopPackage('com.example.pkg', makeShutdownCtx())).resolves.toBeUndefined()
  })

  it('double shutdown is idempotent', async () => {
    const onStop = vi.fn().mockResolvedValue(undefined)
    const mgr = new RuntimePackageManager(ALLOW_ALL)
    mgr.register(makeRegistration('com.example.pkg', { onStop }))
    await mgr.startPackage('com.example.pkg', makeCtx())
    await mgr.stopPackage('com.example.pkg', makeShutdownCtx())
    await mgr.stopPackage('com.example.pkg', makeShutdownCtx()) // second call
    expect(onStop).toHaveBeenCalledTimes(1) // hook only called once
  })

  it('shutdown produces shutdown events', async () => {
    const mgr = new RuntimePackageManager(ALLOW_ALL)
    mgr.register(makeRegistration())
    await mgr.startPackage('com.example.pkg', makeCtx())
    await mgr.stopPackage('com.example.pkg', makeShutdownCtx())
    const events = mgr.drainEvents()
    expect(events.some((e) => e.eventType === 'shutdown-completed')).toBe(true)
  })
})

// ─── Unknown package ─────────────────────────────────────────────────────────

describe('unknown package', () => {
  it('starting unregistered package fails', async () => {
    const mgr = new RuntimePackageManager(ALLOW_ALL)
    let err: unknown
    try { await mgr.startPackage('com.example.unknown', makeCtx('com.example.unknown')) } catch (e) { err = e }
    expect((err as { code: string }).code).toBe('invalid-input')
  })
})
