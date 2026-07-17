export type ValidationCheckStatus = 'PASS' | 'FAIL' | 'SKIPPED'

export interface ValidationCheck {
  readonly name: string
  readonly status: ValidationCheckStatus
  readonly message?: string
}

export interface CapabilityValidationReport {
  readonly kind: 'CapabilityValidationReport'
  readonly reportId: string
  readonly candidateId: string
  readonly passed: boolean
  readonly checks: readonly ValidationCheck[]
  readonly producedAt: string
}
