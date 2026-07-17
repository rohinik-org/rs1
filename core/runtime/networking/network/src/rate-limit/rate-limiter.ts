// ponytail: per-domain token bucket; tokens replenish at requestsPerSecond
export class RateLimiter {
  private readonly tokens = new Map<string, { count: number; lastRefill: number }>()

  constructor(private readonly requestsPerSecond: number) {}

  private domain(url: string): string {
    try { return new URL(url).hostname } catch { return url }
  }

  private refill(bucket: { count: number; lastRefill: number }): void {
    const now = Date.now()
    const elapsed = (now - bucket.lastRefill) / 1000
    bucket.count = Math.min(this.requestsPerSecond, bucket.count + elapsed * this.requestsPerSecond)
    bucket.lastRefill = now
  }

  tryAcquire(url: string): boolean {
    const domain = this.domain(url)
    let bucket = this.tokens.get(domain)
    if (!bucket) { bucket = { count: this.requestsPerSecond, lastRefill: Date.now() }; this.tokens.set(domain, bucket) }
    this.refill(bucket)
    if (bucket.count >= 1) { bucket.count -= 1; return true }
    return false
  }
}
