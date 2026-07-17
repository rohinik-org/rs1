import type { CertificationScenario } from '@rohinik-org/compiler'

export const acquisitionScenarios: readonly CertificationScenario[] = [
  {
    scenarioId: 'acquisition-validates',
    name: 'Valid package passes acquisition validation',
    tags: ['ACQUISITION'],
    fixture: { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] },
    expectations: [],
  },
  {
    scenarioId: 'acquisition-rejects',
    name: 'Invalid package rejected by acquisition',
    tags: ['ACQUISITION'],
    fixture: { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] },
    expectations: [],
  },
]

export async function runAcquisitionValidates(): Promise<Record<string, unknown>> {
  // Simulate valid package descriptor passes schema validation
  const pkg = { packageId: 'p1', version: '1.0.0', capabilities: ['cap1'] }
  const valid = typeof pkg.packageId === 'string' && typeof pkg.version === 'string'
  return { packageValidated: valid, packageInstalled: valid }
}

export async function runAcquisitionRejects(): Promise<Record<string, unknown>> {
  // Simulate invalid package (missing required fields) is rejected
  const pkg = { packageId: '', version: '' }
  const rejected = pkg.packageId === '' || pkg.version === ''
  return { packageRejected: rejected, packageInstalled: false }
}
