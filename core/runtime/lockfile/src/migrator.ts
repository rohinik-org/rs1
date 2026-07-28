import type { LockfileMigrator } from '@rohinik-org/lockfile-ir'
import { LockMigrationError } from '@rohinik-org/lockfile-ir'
import type { LockfileStoreImpl } from './store.js'
import type { LockfileValidatorImpl } from './parser.js'

export class LockfileMigrationRegistry {
  // ponytail: Map keyed by fromVersion; one migrator per version step
  private readonly migrations: Map<number, LockfileMigrator> = new Map()

  register(migrator: LockfileMigrator): void {
    this.migrations.set(migrator.fromVersion, migrator)
  }

  // Returns null if nothing to migrate (already at targetVersion).
  // Throws LockMigrationError if version unknown or newer than supported.
  migrate(input: unknown, targetVersion: 1): unknown {
    const rec = input as Record<string, unknown>
    const version = typeof rec['lockVersion'] === 'number' ? rec['lockVersion'] : undefined
    if (version === undefined) throw new LockMigrationError('Cannot determine lockVersion from input')
    if (version > targetVersion) {
      throw new LockMigrationError(`Lockfile version ${version} is newer than supported version ${targetVersion}`)
    }
    if (version === targetVersion) return input

    // Step through migration chain
    let current = input
    let currentVersion = version
    while (currentVersion < targetVersion) {
      const migrator = this.migrations.get(currentVersion)
      if (!migrator) throw new LockMigrationError(`No migration registered for lockVersion ${currentVersion}`)
      current = migrator.migrate(current)
      currentVersion = migrator.toVersion
    }
    return current
  }
}

// Identity migration: V1 → V1 (baseline, proves the framework works)
export class V1IdentityMigration implements LockfileMigrator {
  readonly fromVersion = 1
  readonly toVersion = 1
  migrate(input: unknown): unknown { return input }
}

// Full atomic migration pipeline: read → migrate → validate → write
export async function executeMigration(
  projectRoot: string,
  store: LockfileStoreImpl,
  validator: LockfileValidatorImpl,
  registry: LockfileMigrationRegistry,
): Promise<void> {
  const raw = await store.readRaw(projectRoot)
  if (raw === undefined) throw new LockMigrationError(`No lockfile found at ${projectRoot}`)

  // Parse as plain unknown (don't validate yet — we're about to migrate)
  const { load: yamlLoad, JSON_SCHEMA } = await import('js-yaml')
  const parsed = yamlLoad(raw, { schema: JSON_SCHEMA }) as unknown

  const migrated = registry.migrate(parsed, 1)

  // Validate migrated result
  const lockfile = validator.parse(migrated)
  const result = validator.validate(lockfile)
  if (!result.valid) {
    throw new LockMigrationError(`Migrated lockfile failed validation: ${result.diagnostics.map(d => d.message).join('; ')}`)
  }

  await store.writeAtomic(projectRoot, lockfile)
}
