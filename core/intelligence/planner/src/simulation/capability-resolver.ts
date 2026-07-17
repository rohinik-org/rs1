export interface CapabilityMatch {
  readonly skillId: string
  readonly inputType: string
  readonly outputType: string
}

export interface CapabilityResolver {
  readonly registryRevision: number
  resolveSkill(skillId: string): boolean
  resolve(inputType: string, outputType: string): readonly CapabilityMatch[]
}
