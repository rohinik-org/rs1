import { describe, it, expect } from 'vitest'
import { SessionManager } from '../session-manager.js'

describe('SessionManager', () => {
  it('creates a new session with empty bindings', () => {
    const mgr = new SessionManager()
    const ctx = mgr.create()
    expect(ctx.sessionId).toBeTruthy()
    expect(ctx.bindings).toEqual({})
    expect(ctx.activeArtifacts).toHaveLength(0)
  })

  it('binds a value and retrieves updated context', () => {
    const mgr = new SessionManager()
    mgr.create()
    const updated = mgr.bind('currentProject', '/home/user/my-project')
    expect(updated.bindings['currentProject']).toBe('/home/user/my-project')
  })

  it('adds an artifact reference to activeArtifacts', () => {
    const mgr = new SessionManager()
    mgr.create()
    const ctx = mgr.addArtifact({ artifactId: 'i1', kind: 'IntentIR', schemaVersion: '1.0' })
    expect(ctx.activeArtifacts).toHaveLength(1)
    expect(ctx.activeArtifacts[0]!.artifactId).toBe('i1')
  })

  it('returns current context without mutation', () => {
    const mgr = new SessionManager()
    const ctx1 = mgr.create()
    mgr.bind('x', 1)
    const ctx2 = mgr.current()
    expect(ctx1.bindings['x']).toBeUndefined()
    expect(ctx2.bindings['x']).toBe(1)
  })

  it('throws when calling current/bind before create', () => {
    const mgr = new SessionManager()
    expect(() => mgr.current()).toThrow('No active session')
    expect(() => mgr.bind('x', 1)).toThrow('No active session')
  })
})
