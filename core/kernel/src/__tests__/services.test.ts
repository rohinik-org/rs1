import { describe, it, expect } from 'vitest'
import { createLogger } from '../services/logger.js'
import { InMemoryMetricsCollector } from '../services/metrics.js'
import { InMemoryConfigService } from '../services/config.js'
import { NullCacheService } from '../services/cache.js'
import { NodeEventBus } from '../services/events.js'

describe('Logger', () => {
  it('creates a logger without throwing', () => {
    const logger = createLogger({ level: 'silent' })
    expect(() => logger.info('test')).not.toThrow()
  })
})

describe('InMemoryMetricsCollector', () => {
  it('increments counters', () => {
    const m = new InMemoryMetricsCollector()
    m.increment('reasoning_avoided_total')
    m.increment('reasoning_avoided_total')
    expect(m.getCounter('reasoning_avoided_total')).toBe(2)
  })

  it('records histogram values', () => {
    const m = new InMemoryMetricsCollector()
    m.histogram('routing_time_ms', 42)
    expect(m.getCounter('routing_time_ms')).toBe(0) // histogram is separate
  })

  it('returns 0 for unknown counter', () => {
    const m = new InMemoryMetricsCollector()
    expect(m.getCounter('unknown_metric')).toBe(0)
  })
})

describe('InMemoryConfigService', () => {
  it('returns default value for unknown key', () => {
    const cfg = new InMemoryConfigService({})
    expect(cfg.get('unknown', 42)).toBe(42)
  })

  it('returns stored value', () => {
    const cfg = new InMemoryConfigService({ 'app.name': 'aios' })
    expect(cfg.get('app.name', '')).toBe('aios')
  })
})

describe('NullCacheService', () => {
  it('always returns undefined on get', async () => {
    const cache = new NullCacheService()
    expect(await cache.get('any-key')).toBeUndefined()
  })

  it('set is a no-op', async () => {
    const cache = new NullCacheService()
    await expect(cache.set('key', 'value')).resolves.toBeUndefined()
  })
})

describe('NodeEventBus', () => {
  it('emits and receives events', () => {
    const bus = new NodeEventBus()
    const received: unknown[] = []
    bus.on('test', (data) => received.push(data))
    bus.emit('test', { foo: 'bar' })
    expect(received).toEqual([{ foo: 'bar' }])
  })

  it('off removes handler', () => {
    const bus = new NodeEventBus()
    const received: unknown[] = []
    const handler = (data: unknown) => received.push(data)
    bus.on('test', handler)
    bus.off('test', handler)
    bus.emit('test', 'ignored')
    expect(received).toHaveLength(0)
  })
})
