import {
  ContextQualityError,
  ContextQualityErrorCode,
  ContextAdmissionDecision,
  computePackageHash,
  computeContractHash,
  computeContentHash,
} from '@rohinik-org/context-quality-ir'
import type {
  InvocationContext,
  NoContextRequiredDeclaration,
  ContextContract,
  ContextContractId,
  OperationId,
} from '@rohinik-org/context-quality-ir'

// L-11D-001: Every provider call site must pass through this guard.
// L-11D-008: package delivered must match package evaluated.
export function assertInvocationContextAdmitted(ctx: InvocationContext, contract: ContextContract): void {
  if (ctx.kind === 'context-free') {
    if (contract.contextRequirement !== 'none') {
      throw new ContextQualityError(
        `Context-free invocation rejected: contract '${contract.contractId}' requires contextRequirement='none' but has '${contract.contextRequirement}'`,
        ContextQualityErrorCode.INVOCATION_WITHOUT_ADMISSION,
      )
    }
    if (ctx.declaration.contractId !== contract.contractId) {
      throw new ContextQualityError(
        `Context-free declaration contractId '${ctx.declaration.contractId}' does not match invocation contract '${contract.contractId}'`,
        ContextQualityErrorCode.INVOCATION_WITHOUT_ADMISSION,
      )
    }
    // ponytail: Fix 16 — lock contract version at declaration time; mismatch = contract changed after declaration
    const actualContractHash = computeContractHash(contract)
    if (ctx.declaration.contractHash !== actualContractHash) {
      throw new ContextQualityError(
        `Context-free declaration contractHash mismatch — contract changed after declaration`,
        ContextQualityErrorCode.INVOCATION_WITHOUT_ADMISSION,
      )
    }
    return
  }

  const { manifest, pkg } = ctx

  if (
    manifest.admissionDecision !== ContextAdmissionDecision.ADMITTED &&
    manifest.admissionDecision !== ContextAdmissionDecision.ADMITTED_DEGRADED
  ) {
    throw new ContextQualityError(
      `Provider invocation blocked: manifest admissionDecision='${manifest.admissionDecision}'`,
      ContextQualityErrorCode.INVOCATION_WITHOUT_ADMISSION,
    )
  }

  if (manifest.packageId !== pkg.packageId) {
    throw new ContextQualityError(
      `Package identity mismatch: manifest.packageId='${manifest.packageId}' but pkg.packageId='${pkg.packageId}'`,
      ContextQualityErrorCode.PACKAGE_MUTATED,
    )
  }

  if (manifest.packageHash !== pkg.packageHash) {
    throw new ContextQualityError(
      `Package hash mismatch: manifest records '${manifest.packageHash}' but pkg.packageHash='${pkg.packageHash}'`,
      ContextQualityErrorCode.PACKAGE_MUTATED,
    )
  }

  const actualHash = computePackageHash(pkg)
  if (actualHash !== pkg.packageHash) {
    throw new ContextQualityError(
      `Package content hash mismatch: computed '${actualHash}' but stored '${pkg.packageHash}'`,
      ContextQualityErrorCode.PACKAGE_MUTATED,
    )
  }
}

// Fix 13+16: context-free declaration tied to specific operation + contract; contractHash locks the contract version
export function makeContextFreeDeclaration(
  operationId: OperationId,
  contractId:  ContextContractId,
  contract:    ContextContract,
): NoContextRequiredDeclaration {
  const contractHash    = computeContractHash(contract)
  const declarationHash = computeContentHash(`context-free:${operationId}:${contractId}:${contractHash}`)
  return { kind: 'context-free', operationId, contractId, contractHash, declarationHash }
}
