import type { ApplicationManifest, ApplicationContext, ApplicationOptions } from '@rohinik-org/compiler'

export function buildManifest(context: ApplicationContext, options: ApplicationOptions): ApplicationManifest {
  const enabledCapabilities: string[] = []
  if (options.enableMemory) enabledCapabilities.push('memory')
  if (options.enableReasoning) enabledCapabilities.push('reasoning')
  if (options.enableReflection) enabledCapabilities.push('reflection')
  if (options.enableObservation) enabledCapabilities.push('observation')
  if (options.enableCertification) enabledCapabilities.push('certification')
  if (options.enableCluster) enabledCapabilities.push('cluster')

  return {
    applicationId: context.applicationId,
    name: context.name,
    version: context.version,
    enabledCapabilities,
    createdAt: context.startedAt,
  }
}
