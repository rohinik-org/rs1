import { ConformanceEngine, createDefaultRuleSet } from '@rohinik-org/package-conformance'

export const VALID_YAML = `
schemaVersion: rohinik.package/v1
package:
  id: org.rohinik.ai.mock
  name: Rohinik Mock Package
  version: 1.0.0
  type: capability-provider
  description: Official mock package for Stage 9K testing
  license: Apache-2.0
publisher:
  id: org.rohinik
  certification: official
runtime:
  language: typescript
  languageVersion: ">=18"
  entrypoint: dist/index.js
provides:
  - capability: rohinik:mock:echo
    version: 1.0.0
    description: Echo capability for testing
health:
  readiness: /health/ready
lifecycle:
  idempotentShutdown: true
  gracefulShutdownTimeoutMs: 5000
`

export function buildEngine() {
  return new ConformanceEngine(createDefaultRuleSet())
}
