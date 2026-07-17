import type { ExecutionReport, VerificationReport } from '@rohinik-org/compiler'

export function formatResult(report: ExecutionReport, _verification: VerificationReport): string {
  const lines: string[] = []
  if (report.status === 'SUCCESS') lines.push('✓ Done.')
  else if (report.status === 'PARTIAL') lines.push('⚠ Partially completed.')
  else lines.push(`✗ Failed (${report.status}).`)

  const outputEntries = Object.entries(report.outputs)
  for (const [key, value] of outputEntries) {
    lines.push(`  ${key}: ${JSON.stringify(value)}`)
  }
  for (const w of report.warnings) lines.push(`  ⚠ ${w}`)
  for (const f of report.failures) lines.push(`  ✗ Step ${f.planStepId}: ${f.message}`)
  lines.push(`  Execution ID: ${report.meta.artifactId}`)
  return lines.join('\n')
}
