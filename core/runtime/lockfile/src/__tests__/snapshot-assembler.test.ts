import { describe, it, expect } from 'vitest'
import { SnapshotAssemblerImpl } from '../snapshot-assembler.js'
import { SnapshotAdmissionError } from '@rohinik-org/lockfile-ir'
import type { DeliveredEnvironmentAssemblyInput } from '@rohinik-org/lockfile-ir'
import type {
  ManagedProvisioningResult,
  AuthorizedCapabilityResolutionPlan,
} from '@rohinik-org/provisioning-ir'

const assembler = new SnapshotAssemblerImpl()

function makePlan(): AuthorizedCapabilityResolutionPlan {
  return {
    kind: 'authorized-capability-resolution-plan',
    schemaVersion: 1,
    authorizationId: 'auth-1' as AuthorizedCapabilityResolutionPlan['authorizationId'],
    proposedPlanId: 'plan-1' as AuthorizedCapabilityResolutionPlan['proposedPlanId'],
    proposedPlanSemanticHash: 'ppsh' as AuthorizedCapabilityResolutionPlan['proposedPlanSemanticHash'],
    authorizedAt: '2026-01-01T00:00:00Z' as AuthorizedCapabilityResolutionPlan['authorizedAt'],
    authorizationPolicyId: 'pol-1',
    authorizedActions: [],
    verifiedArtifacts: [],
    permissionAuthorizations: [],
    npmInstallManifests: [],
    secretRequirements: [],
    semanticHash: 'apsh' as AuthorizedCapabilityResolutionPlan['semanticHash'],
    authorizationProof: {
      algorithm: 'in-process-token',
      issuer: 'test' as AuthorizedCapabilityResolutionPlan['authorizationProof']['issuer'],
      signedPayloadHash: 'spsh' as AuthorizedCapabilityResolutionPlan['authorizationProof']['signedPayloadHash'],
      token: 'tok',
    },
  }
}

function makeResult(overrides?: Partial<ManagedProvisioningResult>): ManagedProvisioningResult {
  return {
    mode: 'managed',
    executionId: 'exec-1' as ManagedProvisioningResult['executionId'],
    authorizationId: 'auth-1' as ManagedProvisioningResult['authorizationId'],
    planId: 'plan-1' as ManagedProvisioningResult['planId'],
    status: 'success',
    actionResults: [],
    providers: [],
    semanticJournalHash: 'sjh' as ManagedProvisioningResult['semanticJournalHash'],
    auditJournalHash: 'ajh' as ManagedProvisioningResult['auditJournalHash'],
    startedAt: '2026-01-01T00:00:00Z' as ManagedProvisioningResult['startedAt'],
    completedAt: '2026-01-01T00:01:00Z' as ManagedProvisioningResult['completedAt'],
    ...overrides,
  }
}

function makeInput(
  resultOverrides?: Partial<ManagedProvisioningResult>,
): DeliveredEnvironmentAssemblyInput {
  return {
    plan: makePlan(),
    result: makeResult(resultOverrides),
    resolution: {
      proposedPlanId: 'plan-1',
      proposedPlanSemanticHash: 'ppsh',
      authorizedPlanSemanticHash: 'apsh',
      authorizationId: 'auth-1',
      resolverIdentity: { implementationId: 'resolver', version: '1.0.0' },
      resolutionPolicySemanticHash: 'rpsh',
      catalogSnapshots: [],
    },
  }
}

describe('SnapshotAssemblerImpl — admission conditions', () => {
  it('rejects non-managed provisioning result', async () => {
    const input = makeInput()
    // ponytail: cast to bypass type; runtime check under test
    ;(input.result as unknown as { mode: string }).mode = 'observed'
    await expect(assembler.assemble(input)).rejects.toThrow(SnapshotAdmissionError)
  })

  it('rejects failed provisioning status', async () => {
    const input = makeInput({ status: 'failed' })
    await expect(assembler.assemble(input)).rejects.toThrow(SnapshotAdmissionError)
  })

  it('rejects action with state failed', async () => {
    const input = makeInput({
      actionResults: [{
        actionId: 'act-1' as ManagedProvisioningResult['actionResults'][0]['actionId'],
        state: 'failed',
        diagnosticCodes: [],
        diagnosticIds: [],
      }],
    })
    await expect(assembler.assemble(input)).rejects.toThrow(SnapshotAdmissionError)
  })

  it('rejects action with state compensation-failed', async () => {
    const input = makeInput({
      actionResults: [{
        actionId: 'act-2' as ManagedProvisioningResult['actionResults'][0]['actionId'],
        state: 'compensation-failed',
        diagnosticCodes: [],
        diagnosticIds: [],
      }],
    })
    await expect(assembler.assemble(input)).rejects.toThrow(SnapshotAdmissionError)
  })

  it('rejects provider not in ready state', async () => {
    const input = makeInput({
      providers: [{
        providerId: 'prov-1',
        packageId: 'pkg-1' as ManagedProvisioningResult['providers'][0]['packageId'],
        version: '1.0.0',
        state: 'validation-failed',
      }],
    })
    await expect(assembler.assemble(input)).rejects.toThrow(SnapshotAdmissionError)
  })

  it('rejects missing semanticJournalHash', async () => {
    const input = makeInput({ semanticJournalHash: '' as ManagedProvisioningResult['semanticJournalHash'] })
    await expect(assembler.assemble(input)).rejects.toThrow(SnapshotAdmissionError)
  })
})

describe('SnapshotAssemblerImpl — happy path', () => {
  it('assembles a valid snapshot from minimal stub data', async () => {
    const input = makeInput()
    const snapshot = await assembler.assemble(input)
    expect(snapshot.kind).toBe('delivered-environment-snapshot')
    expect(snapshot.snapshotVersion).toBe(1)
    expect(snapshot.application.applicationId).toBe('auth-1')
    expect(snapshot.provisioningEvidence.status).toBe('success')
    expect(snapshot.provisioningEvidence.semanticJournalHash).toBe('sjh')
    expect(snapshot.capabilities).toEqual([])
    expect(snapshot.packages).toEqual([])
    expect(snapshot.providers).toEqual([])
  })
})
