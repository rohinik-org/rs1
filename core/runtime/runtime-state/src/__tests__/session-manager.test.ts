import { describe, it, expect, beforeEach } from 'vitest'
import { SessionManager } from '../session/session-manager.js'

describe('SessionManager', () => {
  let mgr: SessionManager

  beforeEach(() => { mgr = new SessionManager() })

  it('create() returns session with given adapterId', () => {
    const s = mgr.create('null', 'ws-1')
    expect(s.adapterId).toBe('null')
  })

  it('create() returns session with given workspaceId', () => {
    const s = mgr.create('null', 'ws-1')
    expect(s.workspaceId).toBe('ws-1')
  })

  it('get() returns created session', () => {
    const s = mgr.create('null', 'ws-1')
    expect(mgr.get(s.id)).toBeDefined()
  })

  it('end() removes session', () => {
    const s = mgr.create('null', 'ws-1')
    mgr.end(s.id)
    expect(mgr.get(s.id)).toBeUndefined()
  })

  it('list() returns all active sessions', () => {
    mgr.create('null', 'ws-1')
    mgr.create('null', 'ws-2')
    expect(mgr.list()).toHaveLength(2)
  })

  it('nextRequestNumber() increments per session', () => {
    const s = mgr.create('null', 'ws-1')
    expect(mgr.nextRequestNumber(s.id)).toBe(1)
    expect(mgr.nextRequestNumber(s.id)).toBe(2)
  })

  it('nextRequestNumber() throws for unknown session', () => {
    expect(() => mgr.nextRequestNumber('missing')).toThrow('Session not found')
  })
})
