export function resolveEndpoint(): string {
  return process.env['ROHINIK_ENDPOINT'] ?? 'http://127.0.0.1:8080'
}

export function resolveTimeoutMs(): number {
  const raw = process.env['ROHINIK_TIMEOUT_MS']
  if (!raw) return 30_000
  const parsed = parseInt(raw, 10)
  return isNaN(parsed) ? 30_000 : parsed
}
