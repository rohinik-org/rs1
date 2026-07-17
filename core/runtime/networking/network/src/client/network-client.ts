import type { NetworkRequest, NetworkResponse } from '@rohinik-org/compiler'

export interface NetworkClient {
  request(req: NetworkRequest): Promise<NetworkResponse>
}
