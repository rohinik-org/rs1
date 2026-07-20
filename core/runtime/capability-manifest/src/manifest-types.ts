export interface CapabilityInputSchema {
  readonly name: string
  readonly type: string
  readonly description?: string
  readonly required?: boolean
}

export interface CapabilityOutputSchema {
  readonly name: string
  readonly type: string
  readonly description?: string
}

export interface CapabilityManifestIR {
  readonly manifestVersion: number
  readonly id: string
  readonly name: string
  readonly description: string
  readonly version: string
  readonly inputs: ReadonlyArray<CapabilityInputSchema>
  readonly outputs: ReadonlyArray<CapabilityOutputSchema>
  readonly tier: string
  readonly tags: ReadonlyArray<string>
  readonly driverRef: string
}
