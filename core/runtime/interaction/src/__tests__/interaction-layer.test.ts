import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InteractionLayer } from '../interaction-layer.js'
import { InteractionHistory } from '@rohinik-org/runtime-state'
import { NullAdapter, makeNullRequest } from '../adapter.js'
import type { Transport, RuntimeInteractionResponse } from '../types.js'
import { randomUUID } from 'node:crypto'

function makeResponse(output = 'ok'): RuntimeInteractionResponse {
  return { executionId: randomUUID(), output, events: [], metadata: {}, durationMs: 5 }
}

function makeTransport(response: RuntimeInteractionResponse): Transport {
  return { type: 'IPC', send: vi.fn().mockResolvedValue(response), close: vi.fn() }
}

describe('InteractionLayer', () => {
  let history: InteractionHistory

  beforeEach(() => { history = new InteractionHistory() })

  it('process() returns response from transport', async () => {
    const layer = new InteractionLayer({
      adapter: new NullAdapter('a', makeNullRequest()),
      transport: makeTransport(makeResponse('hello')),
      history,
    })
    const result = await layer.process(makeNullRequest())
    expect(result.output).toBe('hello')
  })

  it('process() appends success entry to history', async () => {
    const layer = new InteractionLayer({
      adapter: new NullAdapter('a', makeNullRequest()),
      transport: makeTransport(makeResponse()),
      history,
    })
    await layer.process(makeNullRequest())
    expect(history.all()).toHaveLength(1)
  })

  it('process() appends failure entry on transport error', async () => {
    const transport: Transport = {
      type: 'IPC',
      send: vi.fn().mockRejectedValue(new Error('boom')),
      close: vi.fn(),
    }
    const layer = new InteractionLayer({
      adapter: new NullAdapter('a', makeNullRequest()),
      transport,
      history,
    })
    await expect(layer.process(makeNullRequest())).rejects.toThrow('boom')
    expect(history.all()).toHaveLength(1)
    expect(history.all()[0].output).toContain('boom')
  })

  it('process() preserves requestNumber from context', async () => {
    const req = makeNullRequest()
    const layer = new InteractionLayer({
      adapter: new NullAdapter('a', req),
      transport: makeTransport(makeResponse()),
      history,
    })
    await layer.process(req)
    expect(history.all()[0].requestNumber).toBe(req.context.requestNumber)
  })

  it('process() records adapterId in history entry', async () => {
    const layer = new InteractionLayer({
      adapter: new NullAdapter('my-adapter', makeNullRequest()),
      transport: makeTransport(makeResponse()),
      history,
    })
    await layer.process(makeNullRequest())
    expect(history.all()[0].adapterId).toBe('my-adapter')
  })
})
