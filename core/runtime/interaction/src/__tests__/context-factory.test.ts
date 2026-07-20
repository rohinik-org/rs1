import { describe, it, expect, beforeEach } from 'vitest'
import { SessionManager } from '@rohinik-org/runtime-state'
import { InteractionContextFactory } from '../context-factory.js'

const identity = { runtimeId: 'test', version: '0.0.0' }
const opts = { adapterId: 'null', transport: 'IPC' as const, identity }

describe('InteractionContextFactory', () => {
  let sessions: SessionManager
  let factory: InteractionContextFactory

  beforeEach(() => {
    sessions = new SessionManager()
    factory = new InteractionContextFactory(sessions)
  })

  it('build() increments requestNumber per session', () => {
    const s = sessions.create('null', 'ws1')
    const c1 = factory.build(s.id, 'ws1', opts)
    const c2 = factory.build(s.id, 'ws1', opts)
    expect(c1.requestNumber).toBe(1)
    expect(c2.requestNumber).toBe(2)
  })

  it('build() sets adapterId from opts', () => {
    const s = sessions.create('null', 'ws1')
    const ctx = factory.build(s.id, 'ws1', opts)
    expect(ctx.adapterId).toBe('null')
  })

  it('build() defaults locale to en-US', () => {
    const s = sessions.create('null', 'ws1')
    const ctx = factory.build(s.id, 'ws1', opts)
    expect(ctx.locale).toBe('en-US')
  })

  it('build() sets transport from opts', () => {
    const s = sessions.create('null', 'ws1')
    const ctx = factory.build(s.id, 'ws1', { ...opts, transport: 'HTTP' })
    expect(ctx.transport).toBe('HTTP')
  })

  it('buildForNewSession() returns matching sessionId', () => {
    const { sessionId, context } = factory.buildForNewSession('ws1', opts)
    expect(context.sessionId).toBe(sessionId)
  })

  it('buildForNewSession() starts requestNumber at 1', () => {
    const { context } = factory.buildForNewSession('ws1', opts)
    expect(context.requestNumber).toBe(1)
  })
})
