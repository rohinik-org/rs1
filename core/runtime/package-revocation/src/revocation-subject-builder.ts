import type { RevocationEvaluationContext, RevocationPolicy, RevocationSubject } from './types.js'

// Canonical ordering: issuer → key → package → package-version
const ORDER: Record<string, number> = {
  issuer: 0,
  key: 1,
  package: 2,
  'package-version': 3,
}

export function buildRevocationSubjects(
  ctx: RevocationEvaluationContext,
  policy: RevocationPolicy,
): RevocationSubject[] {
  const subjects: RevocationSubject[] = []

  if (ctx.issuerId) {
    subjects.push({ targetKind: 'issuer', targetId: ctx.issuerId })
  }

  if (ctx.signingKeyId) {
    subjects.push({ targetKind: 'key', targetId: ctx.signingKeyId })
  }

  // packageId from subject
  const packageId = ctx.packageId ?? ctx.subject.packageId
  if (packageId) {
    subjects.push({ targetKind: 'package', targetId: packageId })
    subjects.push({
      targetKind: 'package-version',
      targetId: `${packageId}@${ctx.subject.version}`,
    })
  }

  // Deduplicate (same targetKind + targetId)
  const seen = new Set<string>()
  const unique: RevocationSubject[] = []
  for (const s of subjects) {
    const key = `${s.targetKind}::${s.targetId}`
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(s)
    }
  }

  // Sort deterministically
  return unique.sort((a, b) => {
    const ao = ORDER[a.targetKind] ?? 99
    const bo = ORDER[b.targetKind] ?? 99
    if (ao !== bo) return ao - bo
    return a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0
  })
}
