/**
 * Stage 16E — Task 1: @rohinik-org/control-protocol-v1
 *
 * Verifies public surface of the protocol package:
 *   - State enum completeness and freeze
 *   - Transition map covers every state
 *   - Terminal state set correct
 *   - Rollback-as-state absent (RecoveryStrategy instead)
 *   - MutationOutcome enum completeness
 *   - ControlErrorCode completeness
 *   - CONTROL_PROTOCOL_VERSION present
 *   - All DTOs are structural (import-type only — no runtime behaviour)
 *   - ApprovalBinding requires all five fields
 *   - PreMutationCheckpoint shape correct
 *   - ControlWorkflowTransitions: terminal states have no successors
 *   - ControlWorkflowTransitions: all states covered
 */

import { describe, it, expect } from 'vitest'
import {
  CONTROL_PROTOCOL_VERSION,
  CONTROL_PROTOCOL_CONSTANTS,
  ControlWorkflowState,
  ControlWorkflowTransitions,
  ControlWorkflowTerminalStates,
  ControlArtifactActionType,
  MutationOutcome,
  RecoveryStrategy,
  VerificationStatus,
  ControlErrorCode,
} from '../index.js'
import type {
  ControlWorkflowState as CWS,
  ControlArtifact,
  ApprovalBinding,
  ApprovalDecision,
  PreMutationCheckpoint,
  ApplyRecord,
  VerificationResult,
  RecoveryDirective,
  RecoveryRecord,
  ControlWorkflow,
  RegisterArtifactRequest,
  RegisterArtifactResponse,
  ApproveArtifactRequest,
  ApproveArtifactResponse,
  DenyArtifactRequest,
  DenyArtifactResponse,
  CreateWorkflowRequest,
  CreateWorkflowResponse,
  GetWorkflowResponse,
  ApplyWorkflowRequest,
  ApplyWorkflowResponse,
  VerifyWorkflowRequest,
  VerifyWorkflowResponse,
  RecoverWorkflowRequest,
  RecoverWorkflowResponse,
  CancelWorkflowRequest,
  CancelWorkflowResponse,
  ControlEvidenceEvent,
  ControlEvidenceResponse,
  ControlErrorEnvelope,
} from '../index.js'

// ── ControlWorkflowState ──────────────────────────────────────────────────────

describe('ControlWorkflowState', () => {
  it('exposes all 13 states', () => {
    const states = Object.values(ControlWorkflowState)
    const expected = [
      'DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'APPLYING', 'APPLIED',
      'VERIFYING', 'VERIFIED', 'VERIFICATION_FAILED',
      'RECOVERY_REQUIRED', 'RECOVERING', 'RECOVERED',
      'FAILED', 'CANCELLED',
    ]
    for (const s of expected) expect(states).toContain(s)
    expect(states).toHaveLength(13)
  })

  it('is frozen', () => {
    expect(Object.isFrozen(ControlWorkflowState)).toBe(true)
  })

  it('does not include ROLLBACK_PENDING or ROLLING_BACK', () => {
    const states = Object.values(ControlWorkflowState) as string[]
    expect(states).not.toContain('ROLLBACK_PENDING')
    expect(states).not.toContain('ROLLING_BACK')
  })

  it('transition map covers all states', () => {
    for (const state of Object.values(ControlWorkflowState)) {
      expect(ControlWorkflowTransitions).toHaveProperty(state)
    }
  })

  it('terminal states have no successors', () => {
    for (const terminal of ControlWorkflowTerminalStates) {
      expect(ControlWorkflowTransitions[terminal]).toHaveLength(0)
    }
  })

  it('terminal states: VERIFIED, RECOVERED, FAILED, CANCELLED', () => {
    expect(ControlWorkflowTerminalStates.has('VERIFIED'  as CWS)).toBe(true)
    expect(ControlWorkflowTerminalStates.has('RECOVERED' as CWS)).toBe(true)
    expect(ControlWorkflowTerminalStates.has('FAILED'    as CWS)).toBe(true)
    expect(ControlWorkflowTerminalStates.has('CANCELLED' as CWS)).toBe(true)
    expect(ControlWorkflowTerminalStates.size).toBe(4)
  })

  it('DRAFT can transition to AWAITING_APPROVAL or CANCELLED', () => {
    expect(ControlWorkflowTransitions.DRAFT).toContain('AWAITING_APPROVAL')
    expect(ControlWorkflowTransitions.DRAFT).toContain('CANCELLED')
  })

  it('APPLYING can produce RECOVERY_REQUIRED (partial/indeterminate apply)', () => {
    expect(ControlWorkflowTransitions.APPLYING).toContain('RECOVERY_REQUIRED')
  })

  it('VERIFICATION_FAILED leads to RECOVERY_REQUIRED or FAILED', () => {
    expect(ControlWorkflowTransitions.VERIFICATION_FAILED).toContain('RECOVERY_REQUIRED')
    expect(ControlWorkflowTransitions.VERIFICATION_FAILED).toContain('FAILED')
  })

  it('RECOVERING leads to RECOVERED or FAILED', () => {
    expect(ControlWorkflowTransitions.RECOVERING).toContain('RECOVERED')
    expect(ControlWorkflowTransitions.RECOVERING).toContain('FAILED')
  })
})

// ── MutationOutcome ───────────────────────────────────────────────────────────

describe('MutationOutcome', () => {
  it('exposes all 5 outcomes', () => {
    const outcomes = Object.values(MutationOutcome)
    expect(outcomes).toContain('NOT_STARTED')
    expect(outcomes).toContain('NO_MUTATION')
    expect(outcomes).toContain('APPLIED')
    expect(outcomes).toContain('PARTIAL')
    expect(outcomes).toContain('INDETERMINATE')
    expect(outcomes).toHaveLength(5)
  })

  it('is frozen', () => {
    expect(Object.isFrozen(MutationOutcome)).toBe(true)
  })
})

// ── RecoveryStrategy ──────────────────────────────────────────────────────────

describe('RecoveryStrategy', () => {
  it('exposes all 4 strategies (no ROLLBACK as a strategy)', () => {
    const strategies = Object.values(RecoveryStrategy)
    expect(strategies).toContain('REVERSE_PATCH')
    expect(strategies).toContain('RESTORE_CHECKPOINT')
    expect(strategies).toContain('COMPENSATING_CHANGE')
    expect(strategies).toContain('MANUAL')
    expect(strategies).toHaveLength(4)
  })

  it('is frozen', () => {
    expect(Object.isFrozen(RecoveryStrategy)).toBe(true)
  })
})

// ── ControlArtifactActionType ─────────────────────────────────────────────────

describe('ControlArtifactActionType', () => {
  it('exposes FILE_PATCH, SCHEMA_MIGRATION, CONFIG_CHANGE, SCRIPT_EXECUTION', () => {
    expect(Object.values(ControlArtifactActionType)).toContain('FILE_PATCH')
    expect(Object.values(ControlArtifactActionType)).toContain('SCHEMA_MIGRATION')
    expect(Object.values(ControlArtifactActionType)).toContain('CONFIG_CHANGE')
    expect(Object.values(ControlArtifactActionType)).toContain('SCRIPT_EXECUTION')
  })

  it('is frozen', () => {
    expect(Object.isFrozen(ControlArtifactActionType)).toBe(true)
  })
})

// ── VerificationStatus ────────────────────────────────────────────────────────

describe('VerificationStatus', () => {
  it('exposes PASSED, FAILED, SKIPPED, ERROR', () => {
    expect(Object.values(VerificationStatus)).toContain('PASSED')
    expect(Object.values(VerificationStatus)).toContain('FAILED')
    expect(Object.values(VerificationStatus)).toContain('SKIPPED')
    expect(Object.values(VerificationStatus)).toContain('ERROR')
  })

  it('is frozen', () => {
    expect(Object.isFrozen(VerificationStatus)).toBe(true)
  })
})

// ── ControlErrorCode ──────────────────────────────────────────────────────────

describe('ControlErrorCode', () => {
  it('contains all required error codes', () => {
    const codes = Object.values(ControlErrorCode)
    const required = [
      'ARTIFACT_NOT_FOUND', 'ARTIFACT_ALREADY_EXISTS', 'HASH_MISMATCH',
      'APPROVAL_NOT_FOUND', 'APPROVAL_EXPIRED', 'APPROVAL_BINDING_INVALID',
      'WORKFLOW_NOT_FOUND', 'INVALID_TRANSITION',
      'CHECKPOINT_REQUIRED', 'CHECKPOINT_NOT_FOUND', 'RECOVERY_UNSAFE',
      'VERIFICATION_REQUIRED', 'NO_APPROVAL', 'ALREADY_APPROVED',
      'INVALID_REQUEST', 'INTERNAL_ERROR',
    ]
    for (const c of required) expect(codes).toContain(c)
  })

  it('is frozen', () => {
    expect(Object.isFrozen(ControlErrorCode)).toBe(true)
  })
})

// ── Protocol version + constants ──────────────────────────────────────────────

describe('CONTROL_PROTOCOL_VERSION', () => {
  it('is 1.0.0', () => {
    expect(CONTROL_PROTOCOL_VERSION).toBe('1.0.0')
  })
})

describe('CONTROL_PROTOCOL_CONSTANTS', () => {
  it('routePrefix is /v1/control', () => {
    expect(CONTROL_PROTOCOL_CONSTANTS.routePrefix).toBe('/v1/control')
  })

  it('terminalStates match ControlWorkflowTerminalStates', () => {
    for (const s of CONTROL_PROTOCOL_CONSTANTS.terminalStates) {
      expect(ControlWorkflowTerminalStates.has(s as CWS)).toBe(true)
    }
  })

  it('is frozen', () => {
    expect(Object.isFrozen(CONTROL_PROTOCOL_CONSTANTS)).toBe(true)
  })
})

// ── ApprovalBinding — structural checks ──────────────────────────────────────

describe('ApprovalBinding structural contract', () => {
  it('carries all five binding fields', () => {
    const binding: ApprovalBinding = {
      artifactId:  'art-1',
      version:     '1',
      contentHash: 'abc',
      actionType:  ControlArtifactActionType.FILE_PATCH,
      scope:       '/repo/path',
    }
    expect(binding.artifactId).toBe('art-1')
    expect(binding.version).toBe('1')
    expect(binding.contentHash).toBe('abc')
    expect(binding.actionType).toBe('FILE_PATCH')
    expect(binding.scope).toBe('/repo/path')
  })
})

// ── PreMutationCheckpoint — structural checks ─────────────────────────────────

describe('PreMutationCheckpoint structural contract', () => {
  it('carries headRef, workingTreeHash, indexHash, dirtyState', () => {
    const cp: PreMutationCheckpoint = {
      checkpointId:    'cp-1',
      capturedAt:      '2026-08-10T00:00:00Z',
      headRef:         'abcdef1234567890',
      workingTreeHash: 'wt-hash',
      indexHash:       'idx-hash',
      dirtyState: {
        hasUncommittedChanges: false,
        stagedFileCount:       0,
        unstagedFileCount:     0,
        untrackedFileCount:    0,
        files:                 [],
      },
    }
    expect(cp.headRef).toBeDefined()
    expect(cp.workingTreeHash).toBeDefined()
    expect(cp.indexHash).toBeDefined()
    expect(cp.dirtyState.hasUncommittedChanges).toBe(false)
  })

  it('dirtyState can represent pre-existing dirty working tree', () => {
    const cp: PreMutationCheckpoint = {
      checkpointId:    'cp-2',
      capturedAt:      '2026-08-10T00:00:00Z',
      headRef:         'abcdef1234567890',
      workingTreeHash: 'wt-dirty',
      indexHash:       'idx-dirty',
      dirtyState: {
        hasUncommittedChanges: true,
        stagedFileCount:       2,
        unstagedFileCount:     1,
        untrackedFileCount:    3,
        files:                 ['src/foo.ts', 'src/bar.ts', 'src/baz.ts'],
      },
    }
    expect(cp.dirtyState.hasUncommittedChanges).toBe(true)
    expect(cp.dirtyState.files).toHaveLength(3)
  })
})

// ── ApplyRecord — MutationOutcome correlation ─────────────────────────────────

describe('ApplyRecord MutationOutcome', () => {
  it('exitCode=0 can map to APPLIED or NO_MUTATION', () => {
    const applied: ApplyRecord = {
      artifactId:      'art-1',
      appliedAt:       '2026-08-10T00:00:00Z',
      method:          'git apply',
      exitCode:        0,
      stdout:          '',
      stderr:          '',
      mutationOutcome: MutationOutcome.APPLIED,
      checkpointId:    'cp-1',
    }
    expect(applied.mutationOutcome).toBe('APPLIED')

    const noMutation: ApplyRecord = { ...applied, mutationOutcome: MutationOutcome.NO_MUTATION }
    expect(noMutation.mutationOutcome).toBe('NO_MUTATION')
  })

  it('non-zero exitCode can map to PARTIAL or INDETERMINATE', () => {
    const partial: ApplyRecord = {
      artifactId:      'art-1',
      appliedAt:       '2026-08-10T00:00:00Z',
      method:          'git apply --reject',
      exitCode:        1,
      stdout:          '',
      stderr:          'rejected hunk',
      mutationOutcome: MutationOutcome.PARTIAL,
      checkpointId:    'cp-1',
    }
    expect(partial.mutationOutcome).toBe('PARTIAL')
  })
})

// ── RecoveryDirective — strategy-specific fields ──────────────────────────────

describe('RecoveryDirective', () => {
  it('REVERSE_PATCH needs no extra fields beyond artifact', () => {
    const d: RecoveryDirective = {
      directiveId: 'dir-1',
      artifactId:  'art-1',
      strategy:    RecoveryStrategy.REVERSE_PATCH,
      issuedAt:    '2026-08-10T00:00:00Z',
      operatorId:  'op-1',
      rationale:   'reverse clean apply',
    }
    expect(d.strategy).toBe('REVERSE_PATCH')
    expect(d.checkpointId).toBeUndefined()
  })

  it('RESTORE_CHECKPOINT requires checkpointId', () => {
    const d: RecoveryDirective = {
      directiveId:  'dir-2',
      artifactId:   'art-1',
      strategy:     RecoveryStrategy.RESTORE_CHECKPOINT,
      issuedAt:     '2026-08-10T00:00:00Z',
      operatorId:   'op-1',
      rationale:    'restore pre-apply state',
      checkpointId: 'cp-1',
    }
    expect(d.checkpointId).toBe('cp-1')
  })
})

// ── DTO structural completeness ───────────────────────────────────────────────
// Import-type compilation confirms these shapes exist; spot-check key fields.

describe('DTO structural completeness', () => {
  it('RegisterArtifactRequest has actionType, scope, content', () => {
    const r: RegisterArtifactRequest = {
      actionType: ControlArtifactActionType.FILE_PATCH,
      scope:      '/repo',
      content:    '--- a/file\n+++ b/file\n@@ -1 +1 @@\n+line',
    }
    expect(r.actionType).toBeDefined()
  })

  it('ApproveArtifactRequest requires contentHash + actionType + scope', () => {
    const r: ApproveArtifactRequest = {
      contentHash: 'abc',
      actionType:  ControlArtifactActionType.FILE_PATCH,
      scope:       '/repo',
      operatorId:  'op-1',
    }
    expect(r.contentHash).toBeDefined()
  })

  it('ControlEvidenceResponse carries workflowId, artifactId, state, events', () => {
    const r: ControlEvidenceResponse = {
      workflowId: 'wf-1',
      artifactId: 'art-1',
      state:      ControlWorkflowState.VERIFIED,
      events:     [],
    }
    expect(r.state).toBe('VERIFIED')
  })

  it('ControlErrorEnvelope carries code and message', () => {
    const e: ControlErrorEnvelope = {
      code:    ControlErrorCode.HASH_MISMATCH,
      message: 'Provided hash does not match stored artifact',
    }
    expect(e.code).toBe('HASH_MISMATCH')
  })

  // Structural: remaining DTOs compile — no assertions needed beyond import-type
  it('all remaining DTO shapes compile', () => {
    const _unused = [
      {} as ControlArtifact,
      {} as ApprovalDecision,
      {} as VerificationResult,
      {} as RecoveryRecord,
      {} as ControlWorkflow,
      {} as RegisterArtifactResponse,
      {} as ApproveArtifactResponse,
      {} as DenyArtifactRequest,
      {} as DenyArtifactResponse,
      {} as CreateWorkflowRequest,
      {} as CreateWorkflowResponse,
      {} as GetWorkflowResponse,
      {} as ApplyWorkflowRequest,
      {} as ApplyWorkflowResponse,
      {} as VerifyWorkflowRequest,
      {} as VerifyWorkflowResponse,
      {} as RecoverWorkflowRequest,
      {} as RecoverWorkflowResponse,
      {} as CancelWorkflowRequest,
      {} as CancelWorkflowResponse,
      {} as ControlEvidenceEvent,
    ]
    expect(_unused).toBeDefined()
  })
})
