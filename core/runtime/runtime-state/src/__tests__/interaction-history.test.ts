import { describe, it, expect, beforeEach } from 'vitest'
import { InteractionHistory } from '../history/interaction-history.js'
import { randomUUID } from 'node:crypto'

function makeEntry(sessionId: string, input: string, output = 'ok'): Parameters<InteractionHistory['append']>[0] {
  return {
    requestNumber: 1,
    sessionId,
    workspaceId: randomUUID(),
    adapterId: 'null',
    input,
    output,
    durationMs: 10,
    timestamp: new Date(),
  }
}

describe('InteractionHistory', () => {
  let history: InteractionHistory

  beforeEach(() => { history = new InteractionHistory() })

  it('all() returns empty initially', () => {
    expect(history.all()).toHaveLength(0)
  })

  it('append() stores entry', () => {
    history.append(makeEntry('s1', 'hello'))
    expect(history.all()).toHaveLength(1)
  })

  it('forSession() returns only matching session entries', () => {
    history.append(makeEntry('s1', 'a'))
    history.append(makeEntry('s2', 'b'))
    expect(history.forSession('s1')).toHaveLength(1)
  })

  it('search() matches input substring', () => {
    history.append(makeEntry('s1', 'hello world'))
    history.append(makeEntry('s1', 'goodbye'))
    expect(history.search('hello')).toHaveLength(1)
  })

  it('last() returns last N entries', () => {
    for (let i = 0; i < 5; i++) history.append(makeEntry('s1', `cmd ${i}`))
    expect(history.last(3)).toHaveLength(3)
  })
})
