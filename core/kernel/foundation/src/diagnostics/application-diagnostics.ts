import type { ApplicationDiagnostics, ApplicationContext, ApplicationStatus } from '@rohinik-org/compiler'

export function getDiagnostics(context: ApplicationContext, enabledFacades: string[]): ApplicationDiagnostics {
  const uptime = context.startedAt
    ? Date.now() - new Date(context.startedAt).getTime()
    : 0

  return {
    applicationId: context.applicationId,
    status: context.status,
    uptime,
    enabledFacades,
    generatedAt: new Date().toISOString(),
  }
}

export function resolveEnabledFacades(status: ApplicationStatus, options: {
  enableMemory?: boolean
  enableReasoning?: boolean
  enableReflection?: boolean
  enableObservation?: boolean
  enableCertification?: boolean
  enableCluster?: boolean
}): string[] {
  if (status === 'STOPPED' || status === 'FAILED') return []
  const facades: string[] = ['planning', 'execution']
  if (options.enableMemory) facades.push('memory')
  if (options.enableReasoning) facades.push('reasoning')
  if (options.enableReflection) facades.push('reflection')
  if (options.enableObservation) facades.push('observation')
  if (options.enableCertification) facades.push('certification')
  if (options.enableCluster) facades.push('cluster')
  return facades
}
