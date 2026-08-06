# First Execution

Prove the full end-to-end path using the deterministic mock provider (no network required).

## Prerequisites

```bash
pnpm --filter @rohinik-org/server... run build
```

## Start the server (mock provider)

```bash
ROHINIK_CONFIG=examples/rohinik.mock.yaml node core/runtime/server/dist/bin.js
# rhks started  config=examples/rohinik.mock.yaml  addr=http://127.0.0.1:8080
```

## Send a request

```bash
curl -s -X POST http://127.0.0.1:8080/v1/execute \
  -H 'Content-Type: application/json' \
  -d '{"content":"Hello, Rohinik","contentType":"TEXT","constraints":{"allowReasoning":true}}' \
  | jq .
```

Expected response:

```json
{
  "requestId": "...",
  "output": "[mock] echo: Hello, Rohinik",
  "skillId": "builtin:reasoning",
  "tierId": "REASONING",
  "reasoningInvoked": true,
  "confidence": null,
  "executionTimeMs": 12,
  "resourceCost": { "estimated": { "cpuMs": 0 } },
  "explanation": null
}
```

## TypeScript client

```typescript
const res = await fetch('http://127.0.0.1:8080/v1/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: 'Hello, Rohinik',
    contentType: 'TEXT',
    constraints: { allowReasoning: true },
  }),
})
const result = await res.json()
console.log(result.output) // "[mock] echo: Hello, Rohinik"
```

## Health check

```bash
curl -s http://127.0.0.1:8080/v1/health | jq .status
# "HEALTHY" or "DEGRADED" (degraded if corpus subsystem not started yet)
```

## Real OpenAI provider

Replace `examples/rohinik.mock.yaml` with `examples/rohinik.openai.yaml` and set the env var:

```bash
OPENAI_API_KEY=sk-... ROHINIK_CONFIG=examples/rohinik.openai.yaml node core/runtime/server/dist/bin.js
```

Run the smoke test:

```bash
OPENAI_API_KEY=sk-... pnpm --filter @rohinik-org/server run test:smoke
```

## Config files

| File | Purpose |
|------|---------|
| `examples/rohinik.minimal.yaml` | No providers — routing falls back to DETERMINISTIC tier |
| `examples/rohinik.mock.yaml` | Deterministic echo provider — proves full REASONING path without network |
| `examples/rohinik.openai.yaml` | Real OpenAI provider — requires `OPENAI_API_KEY` |
