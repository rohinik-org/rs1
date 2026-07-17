export interface ResourceCostMeasure {
  readonly usd?: number
  readonly tokens?: number
  readonly cpuMs?: number
  readonly memoryMb?: number
  readonly gpuMs?: number
  readonly networkBytes?: number
}

export interface ResourceCost {
  readonly estimated: ResourceCostMeasure
  readonly actual?: ResourceCostMeasure
}

export const ZERO_COST: ResourceCost = { estimated: {} }
