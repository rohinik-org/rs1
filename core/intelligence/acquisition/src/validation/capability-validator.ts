import { randomUUID } from 'node:crypto'
import type { CapabilityCandidate, CapabilityValidationReport, ValidationCheck } from '@rohinik-org/compiler'
import { SandboxValidator } from './sandbox-validator.js'

const ALLOWED_SCHEMES = new Set(['file', 'npm', 'git', 'https', 'mcp'])
const MIN_CONFIDENCE = 0.5

export class CapabilityValidator {
  private readonly sandbox = new SandboxValidator()

  validate(candidate: CapabilityCandidate): CapabilityValidationReport {
    const checks: ValidationCheck[] = [
      {
        name: 'name-present',
        status: candidate.name.trim().length > 0 ? 'PASS' : 'FAIL',
        ...(!candidate.name.trim().length && { message: 'name must not be empty' }),
      },
      {
        name: 'source-scheme',
        status: ALLOWED_SCHEMES.has(candidate.installSource.scheme) ? 'PASS' : 'FAIL',
        ...(
          !ALLOWED_SCHEMES.has(candidate.installSource.scheme) &&
          { message: `unknown scheme: ${candidate.installSource.scheme}` }
        ),
      },
      this.sandbox.validate(candidate),
      {
        name: 'confidence-threshold',
        status: candidate.confidence >= MIN_CONFIDENCE ? 'PASS' : 'FAIL',
        ...(
          candidate.confidence < MIN_CONFIDENCE &&
          { message: `confidence ${candidate.confidence} below minimum ${MIN_CONFIDENCE}` }
        ),
      },
    ]

    return {
      kind: 'CapabilityValidationReport',
      reportId: randomUUID(),
      candidateId: candidate.candidateId,
      passed: checks.every(c => c.status === 'PASS'),
      checks,
      producedAt: new Date().toISOString(),
    }
  }
}
