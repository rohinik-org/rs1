// DiagnosticSink — how the kernel surfaces deprecation warnings, non-fatal
// issues, and structural warnings to the outside world.
//
// The kernel never calls console.warn directly. Everything routes through
// a DiagnosticSink so the CLI, dashboard, Operator, benchmark, replay, and
// telemetry consumers can all subscribe to the same stream.
//
// v1 ships a ConsoleDiagnosticSink that prints to stderr. Later stages will
// wire this into the runtime event bus and expose it over ARP as
// /v1/diagnostics (SSE).

export type DiagnosticSeverity = 'DEPRECATION' | 'WARNING' | 'ERROR'

export interface Diagnostic {
  readonly severity: DiagnosticSeverity
  readonly code: string
  readonly message: string
  readonly data?: Readonly<Record<string, unknown>>
}

export interface DiagnosticSink {
  emit(diagnostic: Diagnostic): void
}

// Default sink — writes a single line to stderr per diagnostic.
export class ConsoleDiagnosticSink implements DiagnosticSink {
  emit(d: Diagnostic): void {
    process.stderr.write(`[${d.severity}] ${d.code}: ${d.message}\n`)
  }
}

// Collecting sink for tests — captures emissions in memory.
export class CollectingDiagnosticSink implements DiagnosticSink {
  readonly diagnostics: Diagnostic[] = []

  emit(d: Diagnostic): void {
    this.diagnostics.push(d)
  }

  find(code: string): Diagnostic | undefined {
    return this.diagnostics.find(d => d.code === code)
  }
}

// Silent sink — drops everything. Useful when a caller explicitly wants no
// output (e.g., benchmark runs where determinism reporting is separate).
export class NullDiagnosticSink implements DiagnosticSink {
  emit(_: Diagnostic): void {
    /* no-op */
  }
}

export const DEFAULT_DIAGNOSTIC_SINK: DiagnosticSink = new ConsoleDiagnosticSink()
