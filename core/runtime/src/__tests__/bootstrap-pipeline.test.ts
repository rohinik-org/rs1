import { describe, it, expect, vi } from 'vitest'
import { BootstrapPipeline } from '../host/bootstrap-pipeline.js'
import { BuiltinRegistry } from '../host/builtin-registry.js'
import { defaultBootstrapPlan } from '../host/bootstrap-plan.js'
import type { ResolvedConfig } from '../types.js'

const minimalConfig: ResolvedConfig = {
  configPath: '/tmp/rohinik.yaml',
  runtimeId: 'test-runtime-pipeline',
  runtime: {
    routing: { mode: 'balanced', explain: true, traceBuffer: 100 },
    resources: { maxConcurrentRequests: 10, timeoutMs: 5000 },
    logLevel: 'error',
  },
  extensions: { paths: [] },
  providers: {},
  server: { port: 8080, host: '0.0.0.0' },
}

function makePlan(activateFn?: () => void) {
  const reg = new BuiltinRegistry()
  if (activateFn) {
    reg.register({ id: 'test-builtin', version: '0.1.0', activate: activateFn })
  }
  return defaultBootstrapPlan(minimalConfig, reg)
}

describe('BootstrapPipeline', () => {
  it('returns BootstrapResult with runtime and router', async () => {
    const plan = makePlan()
    const result = await new BootstrapPipeline(plan).execute()
    expect(result.runtime).toBeDefined()
    expect(result.router).toBeDefined()
  })

  it('metadata contains startupId', async () => {
    const plan = makePlan()
    const result = await new BootstrapPipeline(plan).execute()
    expect(result.metadata.startupId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('metadata.startupTimeline has 6 entries', async () => {
    const plan = makePlan()
    const result = await new BootstrapPipeline(plan).execute()
    expect(result.metadata.startupTimeline).toHaveLength(6)
  })

  it('calls activate on registered builtins', async () => {
    const activate = vi.fn()
    const plan = makePlan(activate)
    await new BootstrapPipeline(plan).execute()
    expect(activate).toHaveBeenCalledTimes(1)
  })

  it('metadata.builtinsLoaded reflects registered builtins', async () => {
    const activate = vi.fn()
    const plan = makePlan(activate)
    const result = await new BootstrapPipeline(plan).execute()
    expect(result.metadata.builtinsLoaded).toBe(1)
  })

  it('extension load failure is non-fatal (non-fatal mode)', async () => {
    const reg = new BuiltinRegistry()
    const plan = defaultBootstrapPlan(
      { ...minimalConfig, extensions: { paths: ['/does/not/exist'] } },
      reg,
    )
    const result = await new BootstrapPipeline(plan).execute()
    expect(result.runtime).toBeDefined()
    expect(result.metadata.warnings.length).toBeGreaterThan(0)
  })
})
