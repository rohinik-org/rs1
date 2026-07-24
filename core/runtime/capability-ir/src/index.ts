export type CapabilityId = string & { readonly __brand: 'CapabilityId' }
export type ApplicationId = string & { readonly __brand: 'ApplicationId' }
export type ProviderId = string & { readonly __brand: 'ProviderId' }

export const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*){1,3}$/

export function toCapabilityId(raw: string): CapabilityId {
  if (!CAPABILITY_ID_PATTERN.test(raw)) {
    throw new Error(`Invalid CapabilityId: '${raw}'`)
  }
  return raw as CapabilityId
}

export function toApplicationId(raw: string): ApplicationId {
  if (!raw.trim()) {
    throw new Error(`Invalid ApplicationId: '${raw}'`)
  }
  return raw as ApplicationId
}

export function toProviderId(raw: string): ProviderId {
  if (!raw.trim()) {
    throw new Error(`Invalid ProviderId: '${raw}'`)
  }
  return raw as ProviderId
}
