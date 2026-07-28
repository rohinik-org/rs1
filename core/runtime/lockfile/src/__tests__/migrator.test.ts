import { describe, it, expect } from 'vitest'
import { LockfileMigrationRegistry, V1IdentityMigration } from '../migrator.js'
import { LockMigrationError } from '@rohinik-org/lockfile-ir'

describe('V1IdentityMigration', () => {
  const migration = new V1IdentityMigration()

  it('returns input unchanged', () => {
    const input = { lockVersion: 1, kind: 'rohinik-lockfile' }
    expect(migration.migrate(input)).toBe(input)
  })

  it('fromVersion is 1, toVersion is 1', () => {
    expect(migration.fromVersion).toBe(1)
    expect(migration.toVersion).toBe(1)
  })
})

describe('LockfileMigrationRegistry', () => {
  it('V1 input at targetVersion 1 returns input unchanged', () => {
    const registry = new LockfileMigrationRegistry()
    const input = { lockVersion: 1 }
    const result = registry.migrate(input, 1)
    expect(result).toBe(input)
  })

  it('throws LockMigrationError for future version', () => {
    const registry = new LockfileMigrationRegistry()
    const input = { lockVersion: 99 }
    expect(() => registry.migrate(input, 1)).toThrow(LockMigrationError)
  })

  it('throws LockMigrationError for unknown version below target', () => {
    const registry = new LockfileMigrationRegistry()
    // No migrators registered — version 0 → 1 has no path
    const input = { lockVersion: 0 }
    expect(() => registry.migrate(input, 1)).toThrow(LockMigrationError)
  })

  it('throws LockMigrationError when lockVersion is missing', () => {
    const registry = new LockfileMigrationRegistry()
    expect(() => registry.migrate({}, 1)).toThrow(LockMigrationError)
  })

  it('applies migration chain when migrator is registered', () => {
    const registry = new LockfileMigrationRegistry()
    let called = false
    registry.register({
      fromVersion: 0,
      toVersion: 1,
      migrate(input: unknown) { called = true; return { ...(input as object), lockVersion: 1 } },
    })
    const result = registry.migrate({ lockVersion: 0 }, 1) as Record<string, unknown>
    expect(called).toBe(true)
    expect(result['lockVersion']).toBe(1)
  })
})
