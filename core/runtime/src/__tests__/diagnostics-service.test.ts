import { describe, it, expect } from 'vitest'
import { DiagnosticsService } from '../diagnostics/diagnostics-service.js'
import type { BootstrapMetadata } from '../host/bootstrap-context.js'

function makeMetadata(diagnostics: BootstrapMetadata['diagnostics'] = []): BootstrapMetadata {
  return {
    startupId: 'test-id',
    durationMs: 100,
    startupTimeline: [],
    diagnostics,
    warnings: [],
    servicesStarted: [],
    extensionsLoaded: 0,
    providersLoaded: 0,
    capabilitiesLoaded: 0,
    builtinsLoaded: 0,
    providers: [],
  }
}

describe('DiagnosticsService', () => {
  it('all() returns empty on clean boot', () => {
    const svc = new DiagnosticsService(makeMetadata())
    expect(svc.all()).toHaveLength(0)
  })

  it('warnings() returns only WARN entries', () => {
    const svc = new DiagnosticsService(makeMetadata([
      { severity: 'WARN', code: 'W1', message: 'warn' },
      { severity: 'ERROR', code: 'E1', message: 'err' },
    ]))
    const warnings = svc.warnings()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.severity).toBe('WARN')
  })

  it('errors() returns only ERROR entries', () => {
    const svc = new DiagnosticsService(makeMetadata([
      { severity: 'WARN', code: 'W1', message: 'warn' },
      { severity: 'ERROR', code: 'E1', message: 'err' },
    ]))
    expect(svc.errors()).toHaveLength(1)
  })

  it('summary() counts correct', () => {
    const svc = new DiagnosticsService(makeMetadata([
      { severity: 'WARN', code: 'W1', message: 'w' },
      { severity: 'WARN', code: 'W2', message: 'w' },
      { severity: 'ERROR', code: 'E1', message: 'e' },
    ]))
    expect(svc.summary()).toEqual({ warnings: 2, errors: 1, total: 3 })
  })

  it('byCode() filters by code', () => {
    const svc = new DiagnosticsService(makeMetadata([
      { severity: 'WARN', code: 'PROVIDER_LOAD_ERROR', message: 'x' },
      { severity: 'WARN', code: 'EXTENSION_LOAD_WARNING', message: 'y' },
    ]))
    expect(svc.byCode('PROVIDER_LOAD_ERROR')).toHaveLength(1)
    expect(svc.byCode('MISSING')).toHaveLength(0)
  })
})
