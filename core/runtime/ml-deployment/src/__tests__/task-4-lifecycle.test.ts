import { describe, it, expect } from 'vitest'
import type { ContentHash, IsoTimestamp, DeploymentId, EndpointId } from '@rohinik-org/ml-ir'
import {
  createDeploymentLifecycle,
  transitionDeployment,
  createEndpointLifecycle,
  transitionEndpoint,
  type DeploymentLifecycle,
  type DeploymentState,
  type EndpointLifecycle,
  type EndpointLifecycleState,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const DEP  = 'dep-1' as DeploymentId
const EP   = 'ep-1' as EndpointId

function makeDeployment(overrides?: Partial<DeploymentLifecycle>): DeploymentLifecycle {
  return createDeploymentLifecycle({
    deploymentId: DEP,
    admissionHash: HASH,
    createdAt: NOW,
    createdBy: 'principal-1',
    ...overrides,
  })
}

function makeEndpoint(overrides?: Partial<{ endpointId: EndpointId; deploymentId: DeploymentId; createdAt: IsoTimestamp }>): EndpointLifecycle {
  return createEndpointLifecycle({
    endpointId: EP,
    deploymentId: DEP,
    createdAt: NOW,
    ...overrides,
  })
}

// ── deployment creation ───────────────────────────────────────────────────────

describe('createDeploymentLifecycle', () => {
  it('new lifecycle starts in PLANNED state', () => {
    const d = makeDeployment()
    expect(d.state).toBe('PLANNED')
    expect(d.deploymentId).toBe(DEP)
  })

  it('history starts with single PLANNED entry', () => {
    const d = makeDeployment()
    expect(d.history.length).toBe(1)
    expect(d.history[0].state).toBe('PLANNED')
  })

  it('empty deploymentId throws DEPLOYMENT_INVALID_IDENTITY', () => {
    expect(() => createDeploymentLifecycle({ deploymentId: '' as DeploymentId, admissionHash: HASH, createdAt: NOW, createdBy: 'p' }))
      .toThrow('DEPLOYMENT_INVALID_IDENTITY')
  })
})

// ── deployment transitions ────────────────────────────────────────────────────

describe('transitionDeployment: valid transitions', () => {
  it('PLANNED → ADMISSION_PENDING', () => {
    const d = makeDeployment()
    const d2 = transitionDeployment(d, 'ADMISSION_PENDING', NOW, 'principal-1')
    expect(d2.state).toBe('ADMISSION_PENDING')
  })

  it('ADMISSION_PENDING → ADMITTED', () => {
    const d = transitionDeployment(makeDeployment(), 'ADMISSION_PENDING', NOW, 'p')
    const d2 = transitionDeployment(d, 'ADMITTED', NOW, 'p')
    expect(d2.state).toBe('ADMITTED')
  })

  it('ADMITTED → DEPLOYING', () => {
    const d0 = transitionDeployment(makeDeployment(), 'ADMISSION_PENDING', NOW, 'p')
    const d1 = transitionDeployment(d0, 'ADMITTED', NOW, 'p')
    const d2 = transitionDeployment(d1, 'DEPLOYING', NOW, 'p')
    expect(d2.state).toBe('DEPLOYING')
  })

  it('DEPLOYING → ACTIVE', () => {
    const d = transitionDeployment(
      transitionDeployment(
        transitionDeployment(makeDeployment(), 'ADMISSION_PENDING', NOW, 'p'),
        'ADMITTED', NOW, 'p'),
      'DEPLOYING', NOW, 'p')
    const d2 = transitionDeployment(d, 'ACTIVE', NOW, 'p')
    expect(d2.state).toBe('ACTIVE')
  })

  it('DEPLOYING → CANARY', () => {
    const d = transitionDeployment(
      transitionDeployment(
        transitionDeployment(makeDeployment(), 'ADMISSION_PENDING', NOW, 'p'),
        'ADMITTED', NOW, 'p'),
      'DEPLOYING', NOW, 'p')
    expect(transitionDeployment(d, 'CANARY', NOW, 'p').state).toBe('CANARY')
  })

  it('CANARY → ACTIVE', () => {
    const d = transitionDeployment(
      transitionDeployment(
        transitionDeployment(
          transitionDeployment(makeDeployment(), 'ADMISSION_PENDING', NOW, 'p'),
          'ADMITTED', NOW, 'p'),
        'DEPLOYING', NOW, 'p'),
      'CANARY', NOW, 'p')
    expect(transitionDeployment(d, 'ACTIVE', NOW, 'p').state).toBe('ACTIVE')
  })

  it('ACTIVE → DRAINING', () => {
    const active = makeDeploymentAt('ACTIVE')
    expect(transitionDeployment(active, 'DRAINING', NOW, 'p').state).toBe('DRAINING')
  })

  it('ACTIVE → ROLLBACK_PENDING', () => {
    const active = makeDeploymentAt('ACTIVE')
    expect(transitionDeployment(active, 'ROLLBACK_PENDING', NOW, 'p').state).toBe('ROLLBACK_PENDING')
  })

  it('ACTIVE → DEGRADED', () => {
    const active = makeDeploymentAt('ACTIVE')
    expect(transitionDeployment(active, 'DEGRADED', NOW, 'p').state).toBe('DEGRADED')
  })

  it('DEGRADED → ACTIVE', () => {
    const deg = makeDeploymentAt('DEGRADED')
    expect(transitionDeployment(deg, 'ACTIVE', NOW, 'p').state).toBe('ACTIVE')
  })

  it('DEGRADED → ROLLBACK_PENDING', () => {
    const deg = makeDeploymentAt('DEGRADED')
    expect(transitionDeployment(deg, 'ROLLBACK_PENDING', NOW, 'p').state).toBe('ROLLBACK_PENDING')
  })

  it('DEGRADED → DRAINING', () => {
    const deg = makeDeploymentAt('DEGRADED')
    expect(transitionDeployment(deg, 'DRAINING', NOW, 'p').state).toBe('DRAINING')
  })

  it('DEGRADED → FAILED', () => {
    const deg = makeDeploymentAt('DEGRADED')
    expect(transitionDeployment(deg, 'FAILED', NOW, 'p').state).toBe('FAILED')
  })

  it('ROLLBACK_PENDING → ROLLING_BACK', () => {
    const rp = makeDeploymentAt('ROLLBACK_PENDING')
    expect(transitionDeployment(rp, 'ROLLING_BACK', NOW, 'p').state).toBe('ROLLING_BACK')
  })

  it('ROLLING_BACK → ROLLED_BACK', () => {
    const rb = makeDeploymentAt('ROLLING_BACK')
    expect(transitionDeployment(rb, 'ROLLED_BACK', NOW, 'p').state).toBe('ROLLED_BACK')
  })

  it('DRAINING → RETIRED', () => {
    const dr = makeDeploymentAt('DRAINING')
    expect(transitionDeployment(dr, 'RETIRED', NOW, 'p').state).toBe('RETIRED')
  })
})

// ── deployment: invalid transitions ──────────────────────────────────────────

describe('transitionDeployment: invalid transitions', () => {
  it('PLANNED → ACTIVE throws DEPLOYMENT_INVALID_TRANSITION', () => {
    expect(() => transitionDeployment(makeDeployment(), 'ACTIVE', NOW, 'p'))
      .toThrow('DEPLOYMENT_INVALID_TRANSITION')
  })

  it('ACTIVE → PLANNED throws DEPLOYMENT_INVALID_TRANSITION', () => {
    expect(() => transitionDeployment(makeDeploymentAt('ACTIVE'), 'PLANNED', NOW, 'p'))
      .toThrow('DEPLOYMENT_INVALID_TRANSITION')
  })

  it('RETIRED is terminal — any further transition throws DEPLOYMENT_TERMINAL_STATE', () => {
    const retired = makeDeploymentAt('RETIRED')
    expect(() => transitionDeployment(retired, 'ACTIVE', NOW, 'p')).toThrow('DEPLOYMENT_TERMINAL_STATE')
  })

  it('FAILED is terminal', () => {
    const failed = makeDeploymentAt('FAILED')
    expect(() => transitionDeployment(failed, 'ACTIVE', NOW, 'p')).toThrow('DEPLOYMENT_TERMINAL_STATE')
  })

  it('ROLLED_BACK is terminal', () => {
    const rb = makeDeploymentAt('ROLLED_BACK')
    expect(() => transitionDeployment(rb, 'ACTIVE', NOW, 'p')).toThrow('DEPLOYMENT_TERMINAL_STATE')
  })
})

// ── deployment: history is immutable ─────────────────────────────────────────

describe('transitionDeployment: immutable history', () => {
  it('each transition appends to history', () => {
    const d0 = makeDeployment()
    const d1 = transitionDeployment(d0, 'ADMISSION_PENDING', NOW, 'p')
    expect(d1.history.length).toBe(2)
    expect(d1.history[1].state).toBe('ADMISSION_PENDING')
  })

  it('original lifecycle unchanged after transition', () => {
    const d0 = makeDeployment()
    transitionDeployment(d0, 'ADMISSION_PENDING', NOW, 'p')
    expect(d0.state).toBe('PLANNED')
    expect(d0.history.length).toBe(1)
  })
})

// ── deployment: concurrency ───────────────────────────────────────────────────

describe('transitionDeployment: concurrency', () => {
  it('same transition twice without version bump throws DEPLOYMENT_CONCURRENCY_CONFLICT', () => {
    const d = makeDeployment()
    transitionDeployment(d, 'ADMISSION_PENDING', NOW, 'p') // produces version 2
    // d is still at version 1 — re-applying same transition should conflict
    expect(() => transitionDeployment(d, 'ADMISSION_PENDING', NOW, 'p', { expectedVersion: 2 }))
      .toThrow('DEPLOYMENT_CONCURRENCY_CONFLICT')
  })

  it('transition with matching expectedVersion succeeds', () => {
    const d = makeDeployment() // version 1
    const d2 = transitionDeployment(d, 'ADMISSION_PENDING', NOW, 'p', { expectedVersion: 1 })
    expect(d2.state).toBe('ADMISSION_PENDING')
    expect(d2.version).toBe(2)
  })
})

// ── endpoint creation ─────────────────────────────────────────────────────────

describe('createEndpointLifecycle', () => {
  it('new endpoint starts in CREATED state', () => {
    const e = makeEndpoint()
    expect(e.state).toBe('CREATED')
    expect(e.endpointId).toBe(EP)
  })

  it('history starts with single CREATED entry', () => {
    const e = makeEndpoint()
    expect(e.history.length).toBe(1)
    expect(e.history[0].state).toBe('CREATED')
  })

  it('empty endpointId throws DEPLOYMENT_INVALID_IDENTITY', () => {
    expect(() => createEndpointLifecycle({ endpointId: '' as EndpointId, deploymentId: DEP, createdAt: NOW }))
      .toThrow('DEPLOYMENT_INVALID_IDENTITY')
  })
})

// ── endpoint transitions ──────────────────────────────────────────────────────

describe('transitionEndpoint: valid transitions', () => {
  it('CREATED → STARTING', () => {
    const e = makeEndpoint()
    expect(transitionEndpoint(e, 'STARTING', NOW, 'p').state).toBe('STARTING')
  })

  it('STARTING → READY', () => {
    const e = transitionEndpoint(makeEndpoint(), 'STARTING', NOW, 'p')
    expect(transitionEndpoint(e, 'READY', NOW, 'p').state).toBe('READY')
  })

  it('STARTING → DEGRADED', () => {
    const e = transitionEndpoint(makeEndpoint(), 'STARTING', NOW, 'p')
    expect(transitionEndpoint(e, 'DEGRADED', NOW, 'p').state).toBe('DEGRADED')
  })

  it('STARTING → FAILED', () => {
    const e = transitionEndpoint(makeEndpoint(), 'STARTING', NOW, 'p')
    expect(transitionEndpoint(e, 'FAILED', NOW, 'p').state).toBe('FAILED')
  })

  it('READY → DEGRADED', () => {
    const e = makeEndpointAt('READY')
    expect(transitionEndpoint(e, 'DEGRADED', NOW, 'p').state).toBe('DEGRADED')
  })

  it('READY → DRAINING', () => {
    const e = makeEndpointAt('READY')
    expect(transitionEndpoint(e, 'DRAINING', NOW, 'p').state).toBe('DRAINING')
  })

  it('DEGRADED → READY', () => {
    const e = makeEndpointAt('DEGRADED')
    expect(transitionEndpoint(e, 'READY', NOW, 'p').state).toBe('READY')
  })

  it('DEGRADED → DRAINING', () => {
    const e = makeEndpointAt('DEGRADED')
    expect(transitionEndpoint(e, 'DRAINING', NOW, 'p').state).toBe('DRAINING')
  })

  it('DEGRADED → FAILED', () => {
    const e = makeEndpointAt('DEGRADED')
    expect(transitionEndpoint(e, 'FAILED', NOW, 'p').state).toBe('FAILED')
  })

  it('DRAINING → STOPPED', () => {
    const e = makeEndpointAt('DRAINING')
    expect(transitionEndpoint(e, 'STOPPED', NOW, 'p').state).toBe('STOPPED')
  })
})

// ── endpoint: invalid transitions ────────────────────────────────────────────

describe('transitionEndpoint: invalid transitions', () => {
  it('CREATED → READY throws DEPLOYMENT_INVALID_TRANSITION', () => {
    expect(() => transitionEndpoint(makeEndpoint(), 'READY', NOW, 'p'))
      .toThrow('DEPLOYMENT_INVALID_TRANSITION')
  })

  it('STOPPED is terminal', () => {
    const e = makeEndpointAt('STOPPED')
    expect(() => transitionEndpoint(e, 'READY', NOW, 'p')).toThrow('DEPLOYMENT_TERMINAL_STATE')
  })

  it('FAILED is terminal', () => {
    const e = makeEndpointAt('FAILED')
    expect(() => transitionEndpoint(e, 'READY', NOW, 'p')).toThrow('DEPLOYMENT_TERMINAL_STATE')
  })
})

// ── endpoint: immutable history ───────────────────────────────────────────────

describe('transitionEndpoint: immutable history', () => {
  it('transition appends to history, original unchanged', () => {
    const e0 = makeEndpoint()
    const e1 = transitionEndpoint(e0, 'STARTING', NOW, 'p')
    expect(e1.history.length).toBe(2)
    expect(e0.state).toBe('CREATED')
  })
})

// ── deployment/endpoint separation ───────────────────────────────────────────

describe('lifecycle separation', () => {
  it('deployment and endpoint have independent state machines', () => {
    const d = makeDeploymentAt('ACTIVE')
    const e = makeEndpointAt('READY')
    expect(d.state).toBe('ACTIVE')
    expect(e.state).toBe('READY')
  })
})

// ── helpers for shortcuts to specific states ──────────────────────────────────

function makeDeploymentAt(state: DeploymentState): DeploymentLifecycle {
  const stateSeqs: Partial<Record<DeploymentState, DeploymentState[]>> = {
    ADMISSION_PENDING: ['ADMISSION_PENDING'],
    ADMITTED:          ['ADMISSION_PENDING', 'ADMITTED'],
    DEPLOYING:         ['ADMISSION_PENDING', 'ADMITTED', 'DEPLOYING'],
    ACTIVE:            ['ADMISSION_PENDING', 'ADMITTED', 'DEPLOYING', 'ACTIVE'],
    CANARY:            ['ADMISSION_PENDING', 'ADMITTED', 'DEPLOYING', 'CANARY'],
    DEGRADED:          ['ADMISSION_PENDING', 'ADMITTED', 'DEPLOYING', 'ACTIVE', 'DEGRADED'],
    ROLLBACK_PENDING:  ['ADMISSION_PENDING', 'ADMITTED', 'DEPLOYING', 'ACTIVE', 'ROLLBACK_PENDING'],
    ROLLING_BACK:      ['ADMISSION_PENDING', 'ADMITTED', 'DEPLOYING', 'ACTIVE', 'ROLLBACK_PENDING', 'ROLLING_BACK'],
    ROLLED_BACK:       ['ADMISSION_PENDING', 'ADMITTED', 'DEPLOYING', 'ACTIVE', 'ROLLBACK_PENDING', 'ROLLING_BACK', 'ROLLED_BACK'],
    DRAINING:          ['ADMISSION_PENDING', 'ADMITTED', 'DEPLOYING', 'ACTIVE', 'DRAINING'],
    RETIRED:           ['ADMISSION_PENDING', 'ADMITTED', 'DEPLOYING', 'ACTIVE', 'DRAINING', 'RETIRED'],
    FAILED:            ['ADMISSION_PENDING', 'ADMITTED', 'DEPLOYING', 'ACTIVE', 'DEGRADED', 'FAILED'],
  }
  const seq = stateSeqs[state]
  if (!seq) return makeDeployment()
  return seq.reduce<DeploymentLifecycle>((d, s) => transitionDeployment(d, s, NOW, 'p'), makeDeployment())
}

function makeEndpointAt(state: EndpointLifecycleState): EndpointLifecycle {
  const stateSeqs: Partial<Record<EndpointLifecycleState, EndpointLifecycleState[]>> = {
    STARTING:  ['STARTING'],
    READY:     ['STARTING', 'READY'],
    DEGRADED:  ['STARTING', 'DEGRADED'],
    DRAINING:  ['STARTING', 'READY', 'DRAINING'],
    STOPPED:   ['STARTING', 'READY', 'DRAINING', 'STOPPED'],
    FAILED:    ['STARTING', 'FAILED'],
  }
  const seq = stateSeqs[state]
  if (!seq) return makeEndpoint()
  return seq.reduce<EndpointLifecycle>((e, s) => transitionEndpoint(e, s, NOW, 'p'), makeEndpoint())
}
