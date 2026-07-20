import { IpcTransport } from './ipc-transport.js'
import { HttpTransport } from './http-transport.js'
import type { HttpTransportClient } from './http-transport.js'
import type { Transport } from '../types.js'

export interface TransportSelectorOptions {
  socketPath: string
  httpClient: HttpTransportClient
}

export async function selectTransport(options: TransportSelectorOptions): Promise<Transport> {
  const ipc = new IpcTransport(options.socketPath)
  const reachable = await ipc.ping()
  if (reachable) return ipc
  return new HttpTransport(options.httpClient)
}
