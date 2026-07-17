import type { NetworkClient } from '../client/network-client.js'

// ponytail: minimal robots.txt parser — only Disallow lines, per-domain TTL cache
export class RobotsChecker {
  private readonly cache = new Map<string, { rules: string[]; expiresAt: number }>()

  constructor(
    private readonly client: NetworkClient,
    private readonly ttlMs: number = 3_600_000,
    private readonly userAgent: string = 'aios',
  ) {}

  private origin(url: string): string {
    try { const u = new URL(url); return `${u.protocol}//${u.hostname}` } catch { return url }
  }

  private async fetchRules(origin: string): Promise<string[]> {
    try {
      const res = await this.client.request({ requestId: 'robots', method: 'GET', url: `${origin}/robots.txt`, headers: {}, timeoutMs: 5_000 })
      if (res.status !== 200) return []
      const lines = res.body.split('\n')
      const rules: string[] = []
      let applicable = false
      for (const raw of lines) {
        const line = raw.trim()
        if (line.toLowerCase().startsWith('user-agent:')) {
          const agent = line.slice('user-agent:'.length).trim().toLowerCase()
          applicable = agent === '*' || agent === this.userAgent.toLowerCase()
        } else if (applicable && line.toLowerCase().startsWith('disallow:')) {
          const path = line.slice('disallow:'.length).trim()
          if (path) rules.push(path)
        }
      }
      return rules
    } catch { return [] }
  }

  async isAllowed(url: string): Promise<boolean> {
    const origin = this.origin(url)
    let cached = this.cache.get(origin)
    if (!cached || Date.now() > cached.expiresAt) {
      const rules = await this.fetchRules(origin)
      cached = { rules, expiresAt: Date.now() + this.ttlMs }
      this.cache.set(origin, cached)
    }
    const path = new URL(url).pathname
    return !cached.rules.some(rule => path.startsWith(rule))
  }
}
