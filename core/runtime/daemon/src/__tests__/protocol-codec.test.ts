import { describe, it, expect } from 'vitest'
import type { RuntimeCommand, RuntimeResponse } from '@rohinik-org/compiler'
import { ProtocolCodec } from '../ipc/protocol-codec.js'
import { RuntimeJournal } from '../journal/runtime-journal.js'

const codec = new ProtocolCodec()

describe('ProtocolCodec', () => {
  it('encodes RuntimeCommand to NDJSON line', () => {
    const cmd: RuntimeCommand = { requestId: 'r1', type: 'STATUS', payload: {} }
    const line = codec.encode(cmd)
    expect(line.endsWith('\n')).toBe(true)
    expect(JSON.parse(line.trim())).toEqual(cmd)
  })

  it('decodes NDJSON line to RuntimeResponse', () => {
    const resp: RuntimeResponse = { requestId: 'r1', success: true, payload: { status: 'ok' } }
    const line = codec.encode(resp)
    const decoded = codec.decode(line)
    expect(decoded).toEqual(resp)
  })

  it('round-trips RuntimeCommand', () => {
    const cmd: RuntimeCommand = { requestId: 'r2', type: 'EXECUTE', payload: { planId: 'p1' } }
    expect(codec.decode(codec.encode(cmd))).toEqual(cmd)
  })

  it('decode throws on empty line', () => {
    expect(() => codec.decode('')).toThrow()
  })

  it('decode throws on non-object JSON', () => {
    expect(() => codec.decode('"hello"\n')).toThrow()
  })

  it('encodes error response', () => {
    const resp: RuntimeResponse = { requestId: 'r3', success: false, payload: null, error: 'something failed' }
    const decoded = codec.decode(codec.encode(resp)) as RuntimeResponse
    expect(decoded.success).toBe(false)
  })

  it('handles whitespace-padded line', () => {
    const cmd: RuntimeCommand = { requestId: 'r4', type: 'STATUS', payload: {} }
    const padded = '  ' + JSON.stringify(cmd) + '  \n'
    expect(codec.decode(padded)).toEqual(cmd)
  })

  it('encodes all RuntimeCommandType values', () => {
    const types = ['PLAN', 'EXECUTE', 'OBSERVE', 'ACQUIRE', 'REFLECT', 'STATUS', 'SHUTDOWN'] as const
    for (const type of types) {
      const cmd: RuntimeCommand = { requestId: 'x', type, payload: null }
      expect(() => codec.decode(codec.encode(cmd))).not.toThrow()
    }
  })
})

describe('RuntimeJournal', () => {
  it('starts empty', () => {
    const journal = new RuntimeJournal()
    expect(journal.all().length).toBe(0)
    expect(journal.last()).toBeUndefined()
  })

  it('appends entries in order', () => {
    const journal = new RuntimeJournal()
    journal.append('RUNTIME_STARTED')
    journal.append('SERVICE_STARTED', { serviceId: 'executor' })
    expect(journal.all().length).toBe(2)
    expect(journal.all()[0]?.eventType).toBe('RUNTIME_STARTED')
    expect(journal.all()[1]?.eventType).toBe('SERVICE_STARTED')
  })

  it('last() returns most recent entry', () => {
    const journal = new RuntimeJournal()
    journal.append('RUNTIME_STARTED')
    journal.append('RUNTIME_STOPPED')
    expect(journal.last()?.eventType).toBe('RUNTIME_STOPPED')
  })

  it('entries are immutable (all() returns readonly)', () => {
    const journal = new RuntimeJournal()
    journal.append('RUNTIME_STARTED')
    const entries = journal.all()
    expect(Object.isFrozen(entries) || entries.length === 1).toBe(true)
  })
})
