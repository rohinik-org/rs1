import type { PackageQuarantineContext, PackageTrustSubject } from './types.js'

export function resolveQuarantineLocation(
  subject: PackageTrustSubject,
  context: PackageQuarantineContext,
  operationId: string,
): string {
  const baseNs = context.namespacePrefix ?? 'quarantine'
  const safePkg = subject.packageId.replace(/[/\s]+/g, '-').replace(/\.\./g, '-')
  const safeVer = subject.version.replace(/[/\s]+/g, '-').replace(/\.\./g, '-')
  const safeOp = operationId.replace(/[/\s]+/g, '-').replace(/\.\./g, '-')
  const path = `${baseNs}/${safePkg}/${safeVer}/${safeOp}`

  if (path.includes('..')) throw new Error(`Resolved path contains ..: ${path}`)
  if (path.startsWith('/')) throw new Error(`Resolved path must not be absolute: ${path}`)
  if (path.includes('//')) throw new Error(`Resolved path contains //: ${path}`)

  return path
}
