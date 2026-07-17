import type { CertificationScenario, CertificationReport } from '@rohinik-org/compiler'
import type { CertifyFacade } from './facade-types.js'
import type { RunnerMap, CertificationStore } from '@rohinik-org/runtime-certification'
import { CertificationRunner, NullCertificationStore } from '@rohinik-org/runtime-certification'

export class DefaultCertifyFacade implements CertifyFacade {
  private readonly store: CertificationStore
  private readonly runner: CertificationRunner

  constructor(store: CertificationStore = new NullCertificationStore()) {
    this.store = store
    this.runner = new CertificationRunner(store)
  }

  run(scenarios: readonly CertificationScenario[], runners: RunnerMap): Promise<CertificationReport> {
    return this.runner.run(scenarios, runners)
  }

  latest(): Promise<CertificationReport | undefined> {
    return this.store.latest()
  }
}

export class NoopCertifyFacade implements CertifyFacade {
  run(_scenarios: readonly CertificationScenario[], _runners: RunnerMap): Promise<CertificationReport> {
    return Promise.resolve({
      reportId: '', version: '0.1.0',
      startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      results: [],
      summary: { totalScenarios: 0, passed: 0, failed: 0, warned: 0, skipped: 0, overallStatus: 'SKIPPED' },
      violations: [],
    })
  }

  latest(): Promise<CertificationReport | undefined> {
    return Promise.resolve(undefined)
  }
}
