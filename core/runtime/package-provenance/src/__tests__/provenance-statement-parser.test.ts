import { describe, it, expect } from 'vitest'
import { ProvenanceStatementParser } from '../provenance-statement-parser.js'
import type { ProvenanceStatement } from '../types.js'
import type { IntegrityDigest } from '@rohinik-org/package-trust-ir'

const DIGEST: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) }

function makeStatement(): ProvenanceStatement {
  return {
    statementId: 'stmt-1',
    statementType: 'build-attestation',
    statementVersion: '1.0',
    subjects: [{ subjectId: 'sub-1', packageId: 'pkg', version: '1.0.0', digest: DIGEST }],
    predicateType: 'https://example.com/predicate/v1',
    issuedAt: new Date(Date.now() - 1000).toISOString(),
    materials: [],
    outputs: [],
    authorityIssuerId: 'issuer-1',
    envelope: { provenanceVersion: '1', issuerId: 'issuer-1', buildId: 'b1', outputIntegrity: DIGEST, builderIdentity: 'builder-1', builtAt: new Date().toISOString(), signature: 'sig' },
  }
}

const p = new ProvenanceStatementParser()

describe('ProvenanceStatementParser', () => {
  it('supported statement type passes', () => {
    expect(p.parse(makeStatement()).valid).toBe(true)
  })

  it('empty statement type fails', () => {
    const r = p.parse({ ...makeStatement(), statementType: '' })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('malformed-provenance')
  })

  it('empty statement version fails', () => {
    const r = p.parse({ ...makeStatement(), statementVersion: '' })
    expect(r.valid).toBe(false)
  })

  it('empty predicate type fails', () => {
    const r = p.parse({ ...makeStatement(), predicateType: '' })
    expect(r.valid).toBe(false)
  })

  it('empty subjects list fails', () => {
    const r = p.parse({ ...makeStatement(), subjects: [] })
    expect(r.valid).toBe(false)
  })

  it('missing issuer fails', () => {
    const r = p.parse({ ...makeStatement(), authorityIssuerId: '' })
    expect(r.valid).toBe(false)
  })

  it('malformed issuedAt fails', () => {
    const r = p.parse({ ...makeStatement(), issuedAt: 'bad-date' })
    expect(r.valid).toBe(false)
  })

  it('duplicate contradictory subjects fail', () => {
    const contradictory: ProvenanceStatement = {
      ...makeStatement(),
      subjects: [
        { subjectId: 'sub-1', digest: DIGEST },
        { subjectId: 'sub-1', digest: { algorithm: 'sha256', encoding: 'hex', value: 'b'.repeat(64) } },
      ],
    }
    const r = p.parse(contradictory)
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('conflicting-provenance')
  })

  it('duplicate identical subjects pass (normalized)', () => {
    const dup: ProvenanceStatement = {
      ...makeStatement(),
      subjects: [
        { subjectId: 'sub-1', digest: DIGEST },
        { subjectId: 'sub-1', digest: DIGEST },
      ],
    }
    const r = p.parse(dup)
    expect(r.valid).toBe(true)
  })

  it('signed payload boundary preserved — statementId unchanged', () => {
    const stmt = makeStatement()
    p.parse(stmt)
    expect(stmt.statementId).toBe('stmt-1')
  })
})
