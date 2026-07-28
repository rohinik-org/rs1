import type {
  LockAdmissionController,
  LockAdmissionDecision,
  RohinikLockfileV1,
  ObservedEnvironmentSnapshot,
  LockEnforcementMode,
  LockfileLifecycleService,
  LockfileValidationResult,
  LockfileAuditInput,
  DeliveredEnvironmentSnapshot,
  LockInspectionContext,
  DriftReport,
} from '@rohinik-org/lockfile-ir'
import type { LockDriftDetectorImpl } from './drift-detector.js'
import type { LockfileGeneratorImpl } from './generator.js'
import type { LockfileValidatorImpl } from './parser.js'
import type { LockfileStoreImpl } from './store.js'
import type { WorkspaceInspectors } from './inspectors.js'

export class LockAdmissionControllerImpl implements LockAdmissionController {
  constructor(private readonly detector: LockDriftDetectorImpl) {}

  admit(
    lockfile: RohinikLockfileV1,
    observed: ObservedEnvironmentSnapshot,
    mode: LockEnforcementMode,
  ): LockAdmissionDecision {
    const report = this.detector.detect(lockfile, observed, mode)

    if (report.status === 'security-conflict') {
      return { admitted: false, status: 'security-rejected', report }
    }
    if (report.status === 'conflict') {
      return { admitted: false, status: 'drift-rejected', report }
    }
    // CI/immutable: warnings also block admission
    if ((mode === 'ci' || mode === 'immutable') && report.status === 'warning') {
      return { admitted: false, status: 'drift-rejected', report }
    }
    if (report.status === 'warning') {
      // development mode: admit with warnings
      return { admitted: true, status: 'admitted-with-development-warnings', report }
    }
    return { admitted: true, status: 'compliant', report }
  }
}

export class LockfileLifecycleServiceImpl implements LockfileLifecycleService {
  constructor(
    private readonly generator: LockfileGeneratorImpl,
    private readonly validator: LockfileValidatorImpl,
    private readonly store: LockfileStoreImpl,
    private readonly inspectors: WorkspaceInspectors,
    private readonly detector: LockDriftDetectorImpl,
    private readonly admissionController: LockAdmissionControllerImpl,
  ) {}

  generate(snapshot: DeliveredEnvironmentSnapshot, audit: LockfileAuditInput): RohinikLockfileV1 {
    return this.generator.generate(snapshot, audit)
  }

  validate(lockfile: RohinikLockfileV1): LockfileValidationResult {
    return this.validator.validate(lockfile)
  }

  async inspectCurrentEnvironment(context: LockInspectionContext): Promise<ObservedEnvironmentSnapshot> {
    const root = context.workspace.root
    // ponytail: WorkspaceInspectors is context-specific, so construct per call
    const insp = new (this.inspectors.constructor as new (root: string) => WorkspaceInspectors)(root)

    const [runtime, packages, providers, dependencies, models, infrastructure, configuration] = await Promise.all([
      insp.runtimeInspector().inspectRuntime(),
      insp.packageInspector().inspectPackages(),
      insp.providerInspector().inspectProviders(),
      insp.dependencyInspector().inspectDependencies(),
      insp.modelInspector().inspectModels(),
      insp.infrastructureInspector().inspectInfrastructure(),
      insp.configurationInspector().inspectConfiguration(),
    ])

    return {
      kind: 'observed-environment-snapshot',
      snapshotVersion: 1,
      application: {},
      runtime,
      capabilities: [],
      packages,
      dependencies,
      models,
      infrastructure,
      providers,
      configuration,
      policies: {},
    }
  }

  detectDrift(locked: RohinikLockfileV1, observed: ObservedEnvironmentSnapshot, mode: LockEnforcementMode): DriftReport {
    return this.detector.detect(locked, observed, mode)
  }

  admit(locked: RohinikLockfileV1, observed: ObservedEnvironmentSnapshot, mode: LockEnforcementMode): LockAdmissionDecision {
    return this.admissionController.admit(locked, observed, mode)
  }
}
