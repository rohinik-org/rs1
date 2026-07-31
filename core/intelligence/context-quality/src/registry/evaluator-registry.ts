import { QualityDimension } from '@rohinik-org/context-quality-ir'
import type { ContextContract } from '@rohinik-org/context-quality-ir'

export interface QualityEvaluatorDescriptor {
  readonly dimension:    QualityDimension
  readonly name:         string
  readonly version:      string
  readonly capabilities: readonly string[]
}

export interface RegisteredEvaluator {
  readonly descriptor: QualityEvaluatorDescriptor
  readonly active:     boolean
}

export class EvaluatorRegistry {
  private readonly evaluators = new Map<QualityDimension, RegisteredEvaluator>()

  register(descriptor: QualityEvaluatorDescriptor): void {
    this.evaluators.set(descriptor.dimension, { descriptor, active: true })
  }

  deactivate(dimension: QualityDimension): void {
    const entry = this.evaluators.get(dimension)
    if (entry) this.evaluators.set(dimension, { ...entry, active: false })
  }

  activate(dimension: QualityDimension): void {
    const entry = this.evaluators.get(dimension)
    if (entry) this.evaluators.set(dimension, { ...entry, active: true })
  }

  // Returns active dimensions after filtering by contract's safetyPolicyRef / authorityPolicyRef constraints.
  // Contracts with safety or authority refs must have those evaluators active.
  activeDimensionsFor(contract: ContextContract): readonly QualityDimension[] {
    const active = [...this.evaluators.values()]
      .filter(e => e.active)
      .map(e => e.descriptor.dimension)

    // Safety evaluator is always required when safetyPolicyRef is set
    if (contract.safetyPolicyRef && !active.includes(QualityDimension.SAFETY)) {
      throw new Error(`Contract '${contract.contractId}' requires safetyPolicyRef but SafetyEvaluator is inactive`)
    }
    // Authority evaluator always required when authorityPolicyRef is set
    if (contract.authorityPolicyRef && !active.includes(QualityDimension.AUTHORITY)) {
      throw new Error(`Contract '${contract.contractId}' requires authorityPolicyRef but AuthorityEvaluator is inactive`)
    }

    return active
  }

  getDescriptor(dimension: QualityDimension): QualityEvaluatorDescriptor | undefined {
    return this.evaluators.get(dimension)?.descriptor
  }

  allRegistered(): readonly RegisteredEvaluator[] {
    return [...this.evaluators.values()]
  }
}

export function buildDefaultRegistry(): EvaluatorRegistry {
  const r = new EvaluatorRegistry()
  const dims: QualityDimension[] = Object.values(QualityDimension)
  for (const dim of dims) {
    r.register({ dimension: dim, name: `${dim}-evaluator`, version: '1.0.0', capabilities: [dim] })
  }
  return r
}
