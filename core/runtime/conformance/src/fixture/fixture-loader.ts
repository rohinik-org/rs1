import type { RuntimeFixture } from '@rohinik-org/compiler'

// ponytail: fixture loader populates in-memory stores from RuntimeFixture snapshot
// each scenario runner receives the loaded context, not raw fixture
export interface LoadedFixture {
  readonly fixture: RuntimeFixture
}

export class FixtureLoader {
  load(fixture: RuntimeFixture): LoadedFixture {
    return { fixture }
  }
}
