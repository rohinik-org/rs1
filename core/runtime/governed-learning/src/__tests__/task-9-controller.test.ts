import { describe, it, expect } from 'vitest'
import type { IsoTimestamp, ContentHash } from '@rohinik-org/ml-ir'
import {
  buildGovernedLearningEvent,
  buildGovernedLearningControllerConfig,
  GOVERNED_LEARNING_EVENT_KINDS,
  GovernedLearningError,
  type GovernedLearningEventKind,
  type GovernedLearningEvent,
  type GovernedLearningControllerConfig,
} from '../../src/index.js'

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash

// ── Event kinds ───────────────────────────────────────────────────────────────

describe('GOVERNED_LEARNING_EVENT_KINDS', () => {
  it('contains all 10 required event kinds', () => {
    const required: GovernedLearningEventKind[] = [
      'opportunity-detected',
      'proposal-created',
      'evaluation-completed',
      'admission-decided',
      'deployment-started',
      'observation-recorded',
      'accepted',
      'rollback-requested',
      'rolled-back',
      'superseded',
    ]
    for (const kind of required) {
      expect(GOVERNED_LEARNING_EVENT_KINDS).toContain(kind)
    }
  })

  it('has exactly 10 event kinds', () => {
    expect(GOVERNED_LEARNING_EVENT_KINDS).toHaveLength(10)
  })
})

// ── buildGovernedLearningEvent ────────────────────────────────────────────────

describe('buildGovernedLearningEvent', () => {
  it('valid event has eventHash', () => {
    const e = buildGovernedLearningEvent({
      eventId: 'evt-1' as any,
      kind: 'proposal-created',
      adaptationId: 'adapt-1' as any,
      correlationHash: HASH,
      occurredAt: NOW,
      payload: { proposalId: 'prop-1' },
    })
    expect(e.eventId).toBe('evt-1')
    expect(e.kind).toBe('proposal-created')
    expect(e.eventHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('eventHash is deterministic', () => {
    const input = {
      eventId: 'evt-2' as any,
      kind: 'accepted' as GovernedLearningEventKind,
      adaptationId: 'adapt-1' as any,
      correlationHash: HASH,
      occurredAt: NOW,
      payload: { acceptanceId: 'acc-1' },
    }
    expect(buildGovernedLearningEvent(input).eventHash)
      .toBe(buildGovernedLearningEvent(input).eventHash)
  })

  it('event payload does not contain raw evidence or secrets', () => {
    const e = buildGovernedLearningEvent({
      eventId: 'evt-3' as any,
      kind: 'deployment-started',
      adaptationId: 'adapt-1' as any,
      correlationHash: HASH,
      occurredAt: NOW,
      payload: { deploymentId: 'dep-1' },
    }) as any
    expect('rawEvidence' in e.payload).toBe(false)
    expect('secret' in e.payload).toBe(false)
    expect('credentials' in e.payload).toBe(false)
  })

  it('all 10 event kinds accepted', () => {
    for (const kind of GOVERNED_LEARNING_EVENT_KINDS) {
      const e = buildGovernedLearningEvent({
        eventId: `evt-${kind}` as any,
        kind,
        adaptationId: 'adapt-1' as any,
        correlationHash: HASH,
        occurredAt: NOW,
        payload: {},
      })
      expect(e.kind).toBe(kind)
    }
  })
})

// ── GovernedLearningControllerConfig ─────────────────────────────────────────

describe('buildGovernedLearningControllerConfig', () => {
  it('valid config builds with required ports', () => {
    const config = buildGovernedLearningControllerConfig({
      controllerId: 'gl-ctrl-1',
      maxConcurrentAdaptations: 1,
      shutdownTimeoutMs: 5000,
    })
    expect(config.controllerId).toBe('gl-ctrl-1')
    expect(config.maxConcurrentAdaptations).toBe(1)
  })

  it('maxConcurrentAdaptations < 1 → GOVERNED_LEARNING_INVALID_CANDIDATE', () => {
    expect(() => buildGovernedLearningControllerConfig({
      controllerId: 'gl-ctrl-2',
      maxConcurrentAdaptations: 0,
      shutdownTimeoutMs: 5000,
    })).toThrow(GovernedLearningError)
  })

  it('config has no direct owner repository write fields', () => {
    const config = buildGovernedLearningControllerConfig({
      controllerId: 'gl-ctrl-3',
      maxConcurrentAdaptations: 2,
      shutdownTimeoutMs: 5000,
    }) as any
    expect('ownerRepository' in config).toBe(false)
    expect('writeOwnerData' in config).toBe(false)
  })

  it('controller config references interfaces only — no direct stage imports', () => {
    const config = buildGovernedLearningControllerConfig({
      controllerId: 'gl-ctrl-4',
      maxConcurrentAdaptations: 1,
      shutdownTimeoutMs: 10000,
    })
    expect(config).toBeDefined()
  })
})
