export interface ValidationResult {
  readonly valid: boolean
  readonly error?: string
}

export class ResponseValidator {
  validate(output: unknown): ValidationResult {
    if (output === null || output === undefined) {
      return { valid: false, error: 'Provider returned null or undefined output' }
    }
    return { valid: true }
  }
}
