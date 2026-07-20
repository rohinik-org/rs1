const RESERVED_PREFIXES = ['system:', 'internal:', 'runtime:']

export class CapabilityDriverRegistry {
  private readonly capabilityToDriver = new Map<string, string>()

  registerDriverRef(capabilityId: string, driverRef: string): void {
    for (const prefix of RESERVED_PREFIXES) {
      if (capabilityId.startsWith(prefix)) {
        throw new Error(`Reserved capability prefix: "${prefix}" in "${capabilityId}"`)
      }
    }
    if (this.capabilityToDriver.has(capabilityId)) {
      throw new Error(`Capability already registered: ${capabilityId}`)
    }
    this.capabilityToDriver.set(capabilityId, driverRef)
  }

  resolve(capabilityId: string): { driverRef: string } | undefined {
    const driverRef = this.capabilityToDriver.get(capabilityId)
    if (!driverRef) return undefined
    return { driverRef }
  }

  list(): ReadonlyArray<{ capabilityId: string; driverRef: string }> {
    return Array.from(this.capabilityToDriver.entries()).map(([capabilityId, driverRef]) => ({
      capabilityId,
      driverRef,
    }))
  }
}
