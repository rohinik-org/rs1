export { RohinikClient } from './client/rohinik-client.js'
export type { RohinikClientConfig } from './client/rohinik-client.js'
export { RohinikError } from './client/types.js'
export type {
  ExecuteRequest,
  ExecuteResponse,
  HealthResponse,
  DecisionResponse,
  ExperienceResponse,
  SimulateResponse,
  AgentAdmitRequest,
  AgentAdmitResponse,
  AgentStartResponse,
  AgentRunResponse,
  DelegateRequest,
  DelegateResponse,
  DelegationRunResponse,
  DelegationAcceptResultResponse,
  AgentEvent,
  AgentEvidenceResponse,
} from './client/types.js'
export { collectFiles } from './pipeline/file-collector.js'
export type { CollectedFile, CollectOptions } from './pipeline/file-collector.js'
export { buildAssessmentPrompt } from './pipeline/assessment-builder.js'
export type { AssessmentPromptOptions } from './pipeline/assessment-builder.js'
export { buildPlanPrompt } from './pipeline/plan-builder.js'
export type { PlanPromptOptions } from './pipeline/plan-builder.js'
export { buildPatchPrompt } from './pipeline/patch-builder.js'
export type { PatchPromptOptions } from './pipeline/patch-builder.js'
export { hashPlan, newPlanId, writePlan, readPlan, writeApproval } from './pipeline/plan-store.js'
export type { PlanArtifact, ApprovalRecord } from './pipeline/plan-store.js'
export {
  hashDiff, newPatchId, writePatch, readPatch, updatePatchStatus,
  writePatchApproval, writePatchApplication, writePatchVerification, readPatchApproval,
} from './pipeline/patch-store.js'
export type {
  PatchArtifact, PatchApprovalRecord, PatchApplicationRecord, PatchVerificationRecord,
} from './pipeline/patch-store.js'
export { resolveEndpoint, resolveTimeoutMs } from './config.js'
