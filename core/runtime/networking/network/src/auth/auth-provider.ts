import type { NetworkRequest } from '@rohinik-org/compiler'

export interface AuthProvider {
  apply(req: NetworkRequest): NetworkRequest
}

export class NullAuthProvider implements AuthProvider {
  apply(req: NetworkRequest): NetworkRequest { return req }
}

export class ApiKeyAuthProvider implements AuthProvider {
  constructor(private readonly headerName: string, private readonly apiKey: string) {}
  apply(req: NetworkRequest): NetworkRequest {
    return { ...req, headers: { ...req.headers, [this.headerName]: this.apiKey } }
  }
}

export class BearerAuthProvider implements AuthProvider {
  constructor(private readonly token: string) {}
  apply(req: NetworkRequest): NetworkRequest {
    return { ...req, headers: { ...req.headers, Authorization: `Bearer ${this.token}` } }
  }
}
