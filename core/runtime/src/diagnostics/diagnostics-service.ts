import type { BootstrapMetadata, DiagnosticEntry } from '../host/bootstrap-context.js'

export class DiagnosticsService {
  constructor(private readonly metadata: BootstrapMetadata) {}

  all(): ReadonlyArray<DiagnosticEntry> {
    return this.metadata.diagnostics
  }

  warnings(): ReadonlyArray<DiagnosticEntry> {
    return this.metadata.diagnostics.filter(d => d.severity === 'WARN')
  }

  errors(): ReadonlyArray<DiagnosticEntry> {
    return this.metadata.diagnostics.filter(d => d.severity === 'ERROR')
  }

  byCode(code: string): ReadonlyArray<DiagnosticEntry> {
    return this.metadata.diagnostics.filter(d => d.code === code)
  }

  summary(): { warnings: number; errors: number; total: number } {
    const warnings = this.warnings().length
    const errors = this.errors().length
    return { warnings, errors, total: warnings + errors }
  }
}
