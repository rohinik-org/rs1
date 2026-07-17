import { describe, it, expect, vi } from 'vitest'
import {
  ConsoleDiagnosticSink,
  CollectingDiagnosticSink,
  NullDiagnosticSink,
  type Diagnostic,
} from '../diagnostic-sink.js'

const SAMPLE: Diagnostic = {
  severity: 'DEPRECATION',
  code: 'CAPABILITY_TIER_UNDECLARED',
  message: 'Capability x did not declare execution.tierId',
  data: { capabilityId: 'x' },
}

describe('ConsoleDiagnosticSink', () => {
  it('writes a formatted line to stderr', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    new ConsoleDiagnosticSink().emit(SAMPLE)
    expect(spy).toHaveBeenCalledWith(
      '[DEPRECATION] CAPABILITY_TIER_UNDECLARED: Capability x did not declare execution.tierId\n',
    )
    spy.mockRestore()
  })
})

describe('CollectingDiagnosticSink', () => {
  it('captures every emission', () => {
    const sink = new CollectingDiagnosticSink()
    sink.emit(SAMPLE)
    sink.emit({ ...SAMPLE, code: 'OTHER' })
    expect(sink.diagnostics).toHaveLength(2)
  })

  it('find() returns the matching diagnostic', () => {
    const sink = new CollectingDiagnosticSink()
    sink.emit(SAMPLE)
    expect(sink.find('CAPABILITY_TIER_UNDECLARED')).toBe(SAMPLE)
    expect(sink.find('UNKNOWN')).toBeUndefined()
  })
})

describe('NullDiagnosticSink', () => {
  it('accepts emissions without producing side effects', () => {
    const sink = new NullDiagnosticSink()
    expect(() => sink.emit(SAMPLE)).not.toThrow()
  })
})
