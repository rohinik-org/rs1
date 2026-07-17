import type { CapabilityResolver, CapabilityMatch } from './capability-resolver.js'

export class StaticCapabilityResolver implements CapabilityResolver {
  constructor(
    private readonly skills: ReadonlySet<string>,
    readonly registryRevision: number,
  ) {}

  resolveSkill(skillId: string): boolean {
    return this.skills.has(skillId)
  }

  resolve(_inputType: string, _outputType: string): readonly CapabilityMatch[] {
    return []
  }
}
