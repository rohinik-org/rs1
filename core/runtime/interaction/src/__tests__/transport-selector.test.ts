import { describe, it, expect, vi } from 'vitest'
import { selectTransport } from '../transport/transport-selector.js'
import type { HttpTransportClient } from '../transport/http-transport.js'
import { IpcTransport } from '../transport/ipc-transport.js'
import { HttpTransport } from '../transport/http-transport.js'

describe('selectTransport', () => {
  const httpClient: HttpTransportClient = { execute: vi.fn() }

  it('returns IpcTransport when ping succeeds', async () => {
    vi.spyOn(IpcTransport.prototype, 'ping').mockResolvedValueOnce(true)
    const transport = await selectTransport({ socketPath: '/tmp/test.sock', httpClient })
    expect(transport).toBeInstanceOf(IpcTransport)
  })

  it('returns HttpTransport when ping fails', async () => {
    vi.spyOn(IpcTransport.prototype, 'ping').mockResolvedValueOnce(false)
    const transport = await selectTransport({ socketPath: '/tmp/test.sock', httpClient })
    expect(transport).toBeInstanceOf(HttpTransport)
  })

  it('IpcTransport type is IPC', async () => {
    vi.spyOn(IpcTransport.prototype, 'ping').mockResolvedValueOnce(true)
    const transport = await selectTransport({ socketPath: '/tmp/test.sock', httpClient })
    expect(transport.type).toBe('IPC')
  })

  it('HttpTransport type is HTTP', async () => {
    vi.spyOn(IpcTransport.prototype, 'ping').mockResolvedValueOnce(false)
    const transport = await selectTransport({ socketPath: '/tmp/test.sock', httpClient })
    expect(transport.type).toBe('HTTP')
  })
})
