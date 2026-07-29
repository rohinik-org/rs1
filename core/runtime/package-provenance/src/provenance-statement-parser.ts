import type { ProvenanceStatement, StatementParseResult } from './types.js'

export class ProvenanceStatementParser {
  parse(statement: ProvenanceStatement): StatementParseResult {
    if (!statement.statementType || statement.statementType.trim() === '') {
      return { valid: false, reason: 'malformed-provenance' }
    }

    if (!statement.statementVersion || statement.statementVersion.trim() === '') {
      return { valid: false, reason: 'malformed-provenance' }
    }

    if (!statement.predicateType || statement.predicateType.trim() === '') {
      return { valid: false, reason: 'malformed-provenance' }
    }

    if (!Array.isArray(statement.subjects) || statement.subjects.length === 0) {
      return { valid: false, reason: 'malformed-provenance' }
    }

    for (const subject of statement.subjects) {
      if (!subject.subjectId || !subject.digest?.algorithm || !subject.digest?.value) {
        return { valid: false, reason: 'malformed-provenance' }
      }
    }

    if (!statement.authorityIssuerId || statement.authorityIssuerId.trim() === '') {
      return { valid: false, reason: 'malformed-provenance' }
    }

    if (!statement.issuedAt || isNaN(Date.parse(statement.issuedAt))) {
      return { valid: false, reason: 'malformed-provenance' }
    }

    const subjectIds = statement.subjects.map(s => s.subjectId)
    const uniqueIds = new Set(subjectIds)
    if (uniqueIds.size !== subjectIds.length) {
      const seen = new Set<string>()
      for (const id of subjectIds) {
        if (seen.has(id)) {
          const first = statement.subjects.find(s => s.subjectId === id)!
          const second = statement.subjects.filter(s => s.subjectId === id)[1]!
          if (first.digest.value !== second.digest.value || first.digest.algorithm !== second.digest.algorithm) {
            return { valid: false, reason: 'conflicting-provenance' }
          }
        }
        seen.add(id)
      }
    }

    return { valid: true }
  }
}
