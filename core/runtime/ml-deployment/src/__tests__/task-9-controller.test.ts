import { describe, it, expect } from 'vitest'
import type { ContentHash, IsoTimestamp, DeploymentId } from '@rohinik-org/ml-ir'
import {
  ModelDeploymentController,
  type DeploymentControllerProvider,
  type DeploymentEventBus,
  type DeploymentEvent,
  type DeploymentControllerRequest,
  type DeploymentControllerResponse,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const DEP  = 'dep-1' as DeploymentId

function makeProvider(overrides?: Partial<DeploymentControllerProvider>): DeploymentControllerProvider {
  return {
    prepare:      async () => ({ prepared: true }),
    deploy:       async () => ({ deployed: true }),
    reportHealth: async () => ({ status: 'HEALTHY' as const }),
    rollback:     async () => ({ rolledBack: true }),
    retire:       async () => ({ retired: true }),
    ...overrides,
  }
}

function makeRequest(overrides?: Partial<DeploymentControllerRequest>): DeploymentControllerRequest {
  return {
    deploymentId:            DEP,
    admissionHash:           HASH,
    revisionId:              'rev-1',
    targetEnvironment:       'prod',
    requestedBy:             'principal-1',
    requestedAt:             NOW,
    rollbackTargetRevisionId: 'rev-0',
    ...overrides,
  }
}

// ── dependency direction ──────────────────────────────────────────────────────

describe('ModelDeploymentController: architecture', () => {
  it('controller factory returns an object', () => {
    const ctrl = ModelDeploymentController({ provider: makeProvider() })
    expect(ctrl).toBeDefined()
  })

  it('controller has deploy method', () => {
    const ctrl = ModelDeploymentController({ provider: makeProvider() })
    expect(typeof ctrl.deploy).toBe('function')
  })

  it('no drift or retraining symbols on controller', () => {
    const ctrl = ModelDeploymentController({ provider: makeProvider() }) as any
    expect('driftDetect' in ctrl).toBe(false)
    expect('requestRetraining' in ctrl).toBe(false)
  })
})

// ── deployment success ────────────────────────────────────────────────────────

describe('ModelDeploymentController: deploy', () => {
  it('successful deploy returns DEPLOYED outcome', async () => {
    const ctrl = ModelDeploymentController({ provider: makeProvider() })
    const result = await ctrl.deploy(makeRequest())
    expect(result.outcome).toBe('DEPLOYED')
    expect(result.deploymentId).toBe(DEP)
  })

  it('result carries deploymentHash', async () => {
    const ctrl = ModelDeploymentController({ provider: makeProvider() })
    const result = await ctrl.deploy(makeRequest())
    expect(result.deploymentHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('deploymentHash is deterministic for same input', async () => {
    const ctrl = ModelDeploymentController({ provider: makeProvider() })
    const req = makeRequest()
    const r1 = await ctrl.deploy(req)
    const r2 = await ctrl.deploy(req)
    expect(r1.deploymentHash).toBe(r2.deploymentHash)
  })
})

// ── provider failure ──────────────────────────────────────────────────────────

describe('ModelDeploymentController: provider failure', () => {
  it('prepare failure returns FAILED outcome', async () => {
    const ctrl = ModelDeploymentController({ provider: makeProvider({ prepare: async () => ({ prepared: false, detail: 'disk full' }) }) })
    const result = await ctrl.deploy(makeRequest())
    expect(result.outcome).toBe('FAILED')
  })

  it('deploy failure returns FAILED outcome', async () => {
    const ctrl = ModelDeploymentController({ provider: makeProvider({ deploy: async () => ({ deployed: false }) }) })
    const result = await ctrl.deploy(makeRequest())
    expect(result.outcome).toBe('FAILED')
  })

  it('provider exception produces FAILED, not unhandled throw', async () => {
    const ctrl = ModelDeploymentController({ provider: makeProvider({ deploy: async () => { throw new Error('provider crash') } }) })
    const result = await ctrl.deploy(makeRequest())
    expect(result.outcome).toBe('FAILED')
  })
})

// ── events ────────────────────────────────────────────────────────────────────

describe('ModelDeploymentController: events', () => {
  it('emits DEPLOYMENT_STARTED and DEPLOYMENT_COMPLETED events', async () => {
    const events: DeploymentEvent[] = []
    const bus: DeploymentEventBus = { emit: async (e) => { events.push(e) } }
    const ctrl = ModelDeploymentController({ provider: makeProvider(), eventBus: bus })
    await ctrl.deploy(makeRequest())
    const types = events.map(e => e.type)
    expect(types).toContain('DEPLOYMENT_STARTED')
    expect(types).toContain('DEPLOYMENT_COMPLETED')
  })

  it('events contain no payloads or secrets', async () => {
    const events: DeploymentEvent[] = []
    const bus: DeploymentEventBus = { emit: async (e) => { events.push(e) } }
    const ctrl = ModelDeploymentController({ provider: makeProvider(), eventBus: bus })
    await ctrl.deploy(makeRequest())
    for (const e of events) {
      expect('payload' in e).toBe(false)
      expect('secret' in e).toBe(false)
    }
  })

  it('events carry deploymentId and type, not raw content', async () => {
    const events: DeploymentEvent[] = []
    const bus: DeploymentEventBus = { emit: async (e) => { events.push(e) } }
    const ctrl = ModelDeploymentController({ provider: makeProvider(), eventBus: bus })
    await ctrl.deploy(makeRequest())
    for (const e of events) {
      expect(e.deploymentId).toBe(DEP)
      expect(typeof e.type).toBe('string')
    }
  })
})

// ── dependency direction ──────────────────────────────────────────────────────

describe('ModelDeploymentController: dependency direction', () => {
  it('controller accepts provider interface, not concrete SDK', () => {
    const minimalProvider: DeploymentControllerProvider = {
      prepare:      async () => ({ prepared: true }),
      deploy:       async () => ({ deployed: true }),
      reportHealth: async () => ({ status: 'HEALTHY' }),
      rollback:     async () => ({ rolledBack: true }),
      retire:       async () => ({ retired: true }),
    }
    expect(() => ModelDeploymentController({ provider: minimalProvider })).not.toThrow()
  })
})
