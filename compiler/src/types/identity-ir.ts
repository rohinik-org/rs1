// Identity IR — AFS-0094 Runtime Identity & Persona Framework
// Constitutional identity is frozen in the binary. Deployment persona is optional config.

export interface ConstitutionalIdentity {
  readonly brand: 'Rohinik'                        // frozen — never configurable
  readonly role: 'Intelligent Computing Platform'
  readonly version: string                          // runtime version e.g. '0.1.0'
}

export interface DeploymentPersona {
  readonly assistantName?: string                   // e.g. 'NYRA', 'Acme Assistant'
  readonly organization?: string                    // e.g. 'Acme Corp'
  readonly instructions?: string                    // injected after identity block
}

// RuntimeIdentityContext: built at request time from live runtime state.
// installedCapabilities reflects actual catalog; availableProviders reflects healthy providers.
// Dynamic: installing a new capability automatically changes what the LLM reports.
export interface RuntimeIdentityContext {
  readonly constitutional: ConstitutionalIdentity
  readonly persona?: DeploymentPersona
  readonly installedCapabilities: readonly string[]   // capabilityId list from catalog
  readonly availableProviders: readonly string[]      // providerId list (HEALTHY only)
  readonly runtimeVersion: string
}
