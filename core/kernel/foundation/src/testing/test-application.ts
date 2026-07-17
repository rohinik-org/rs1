import { RohinikApplication } from '../application/rohinik-application.js'
import type { FullApplicationOptions } from '../application/rohinik-application.js'
import { NullMemoryStore } from '@rohinik-org/memory'
import { NullReasoningStore } from '@rohinik-org/reasoning'
import { NullReflectionStore } from '@rohinik-org/reflection'
import { NullObservationStore } from '@rohinik-org/observer'
import { NullCertificationStore } from '@rohinik-org/runtime-certification'

export function createTestApplication(overrides: FullApplicationOptions = {}): RohinikApplication {
  return new RohinikApplication({
    name: 'test-app',
    version: '0.0.0-test',
    enableMemory: true,
    enableReasoning: true,
    enableReflection: true,
    enableObservation: true,
    enableCertification: true,
    enableCluster: true,
    memoryStore: new NullMemoryStore(),
    reasoningStore: new NullReasoningStore(),
    reflectionStore: new NullReflectionStore(),
    observationStore: new NullObservationStore(),
    certificationStore: new NullCertificationStore(),
    ...overrides,
  })
}
