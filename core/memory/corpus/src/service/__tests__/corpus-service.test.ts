import { describe, it, expect, vi } from 'vitest'
import { CorpusService } from '../corpus-service.js'
import type { CorpusStorage } from '../../storage/corpus-storage.js'
import type { EventBus } from '@rohinik-org/kernel'

describe('CorpusService', () => {
  it('subscribes to EXECUTION_RECORD_READY on the event bus', () => {
    const bus = { on: vi.fn(), emit: vi.fn(), off: vi.fn() } as unknown as EventBus
    const storage: CorpusStorage = { write: vi.fn().mockResolvedValue(undefined), read: vi.fn(), readRange: vi.fn(), compact: vi.fn(), archive: vi.fn(), close: vi.fn() }

    const service = new CorpusService(bus, storage, 'runtime-1', '0.1.0')
    service.start()

    expect(bus.on).toHaveBeenCalledWith('EXECUTION_RECORD_READY', expect.any(Function))
  })

  it('handles EXECUTION_RECORD_READY event and writes a record', async () => {
    let handler: ((data: unknown) => void) | null = null
    const bus = {
      on: vi.fn((event, fn) => { if (event === 'EXECUTION_RECORD_READY') handler = fn }),
      emit: vi.fn(), off: vi.fn(),
    } as unknown as EventBus
    const storage: CorpusStorage = { write: vi.fn().mockResolvedValue(undefined), read: vi.fn(), readRange: vi.fn(), compact: vi.fn(), archive: vi.fn(), close: vi.fn() }

    const service = new CorpusService(bus, storage, 'runtime-1', '0.1.0')
    service.start()

    await handler!({
      type: 'EXECUTION_RECORD_READY',
      version: 1,
      requestId: 'req-001',
      timestamp: new Date(),
      trace: { requestId: 'req-001', events: [], reasoningInvoked: false, winnerTierId: 'DETERMINISTIC', winnerSkillId: 'csv.parse' },
      totalLatencyMs: 42,
    })

    await new Promise(r => setTimeout(r, 10))
    expect(storage.write).toHaveBeenCalledOnce()
    const record = vi.mocked(storage.write).mock.calls[0][0]
    expect(record.kind).toBe('ExecutionRecord')
    expect(record.sourceTraceId).toBe('req-001')
  })

  it('does not throw when event payload is malformed', async () => {
    let handler: ((data: unknown) => void) | null = null
    const bus = {
      on: vi.fn((event, fn) => { if (event === 'EXECUTION_RECORD_READY') handler = fn }),
      emit: vi.fn(), off: vi.fn(),
    } as unknown as EventBus
    const storage: CorpusStorage = { write: vi.fn().mockResolvedValue(undefined), read: vi.fn(), readRange: vi.fn(), compact: vi.fn(), archive: vi.fn(), close: vi.fn() }

    const service = new CorpusService(bus, storage, 'runtime-1', '0.1.0')
    service.start()

    await expect(handler!(null)).resolves.toBeUndefined()
    await expect(handler!({})).resolves.toBeUndefined()
  })
})
