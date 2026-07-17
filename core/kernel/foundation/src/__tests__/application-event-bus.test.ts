import { describe, it, expect } from 'vitest'
import { ApplicationEventBus } from '../events/application-event-bus.js'

describe('ApplicationEventBus', () => {
  it('emits event to registered handler', () => {
    const bus = new ApplicationEventBus('app-1')
    const received: string[] = []
    bus.on('test', (e) => { received.push(e.type) })
    bus.emit('test')
    expect(received).toEqual(['test'])
  })

  it('delivers payload in event', () => {
    const bus = new ApplicationEventBus('app-1')
    let payload: unknown
    bus.on('data', (e) => { payload = e.payload })
    bus.emit('data', { value: 42 })
    expect(payload).toEqual({ value: 42 })
  })

  it('on() returns unsubscribe function', () => {
    const bus = new ApplicationEventBus('app-1')
    const received: string[] = []
    const unsub = bus.on('ev', (e) => { received.push(e.type) })
    bus.emit('ev')
    unsub()
    bus.emit('ev')
    expect(received).toHaveLength(1)
  })

  it('off() stops handler', () => {
    const bus = new ApplicationEventBus('app-1')
    const received: string[] = []
    const handler = (e: { type: string }) => { received.push(e.type) }
    bus.on('ev', handler)
    bus.off('ev', handler)
    bus.emit('ev')
    expect(received).toHaveLength(0)
  })

  it('wildcard * handler receives all events', () => {
    const bus = new ApplicationEventBus('app-1')
    const types: string[] = []
    bus.on('*', (e) => { types.push(e.type) })
    bus.emit('a')
    bus.emit('b')
    expect(types).toEqual(['a', 'b'])
  })
})
