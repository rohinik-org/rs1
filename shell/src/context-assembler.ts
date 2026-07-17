import { createHash } from 'node:crypto'
import type {
  CompilerContext, SystemSnapshot, CompilationPolicy,
  RuntimeInfo, FeatureMap,
} from '@rohinik-org/compiler'
import { CapabilitySnapshotBuilder, SessionManager } from '@rohinik-org/compiler'
import { AiosHttpClient } from '@rohinik-org/cli/client'

const DEFAULT_POLICY: CompilationPolicy = {
  clarificationThreshold: 0.65,
  maxPlanSteps: 20,
  allowedTiers: ['MEMORY', 'DETERMINISTIC', 'LOCAL_TOOL', 'EXTERNAL', 'REASONING'],
  verificationMode: 'strict',
}

export class ContextAssembler {
  private readonly client: AiosHttpClient
  private readonly snapshotBuilder: CapabilitySnapshotBuilder
  private readonly sessionManager: SessionManager

  constructor(baseUrl: string) {
    this.client = new AiosHttpClient(baseUrl)
    this.snapshotBuilder = new CapabilitySnapshotBuilder(baseUrl)
    this.sessionManager = new SessionManager()
  }

  async assemble(policy: Partial<CompilationPolicy> = {}): Promise<CompilerContext> {
    const runtimeInfo = await this.client.getRuntime()
    const sessionCtx = this.sessionManager.create()

    const systemSnapshotId = createHash('sha256')
      .update(`${runtimeInfo.runtimeId}-${new Date().toISOString()}`)
      .digest('hex')

    const capabilities = await this.snapshotBuilder.build(sessionCtx.sessionId, systemSnapshotId)

    const features: FeatureMap = {
      memory: runtimeInfo.features['memory'] === true,
      streaming: runtimeInfo.features['streaming'] === true,
      reasoning: runtimeInfo.features['reasoning'] === true,
    }

    const runtime: RuntimeInfo = {
      runtimeId: runtimeInfo.runtimeId,
      protocolVersion: runtimeInfo.build?.['protocolVersion'] ?? '1.0',
      features,
    }

    const system: SystemSnapshot = {
      snapshotId: systemSnapshotId,
      capturedAt: new Date().toISOString(),
      runtime,
      capabilities,
    }

    return {
      session: sessionCtx,
      policy: { ...DEFAULT_POLICY, ...policy },
      system,
    }
  }

  getSessionManager(): SessionManager {
    return this.sessionManager
  }
}
