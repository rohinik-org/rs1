interface RetryConfig {
  readonly maxRetries: number
  readonly baseDelayMs: number
  readonly onRetry?: (attempt: number, error: Error) => void
}

export class RetryHandler {
  constructor(private readonly config: RetryConfig) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error = new Error('unknown')
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (attempt < this.config.maxRetries) {
          this.config.onRetry?.(attempt + 1, lastError)
          if (this.config.baseDelayMs > 0) {
            await new Promise(r => setTimeout(r, this.config.baseDelayMs * (attempt + 1)))
          }
        }
      }
    }
    throw lastError
  }
}
