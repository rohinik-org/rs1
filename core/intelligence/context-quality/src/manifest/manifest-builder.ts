import { contextManifestId } from '@rohinik-org/context-quality-ir'
import type {
  ContextPackage,
  ContextQualityReport,
  ContextAdmissionDecision,
  ContextManifest,
  ContextManifestEntry,
  ContentHash,
  IdGenerator,
} from '@rohinik-org/context-quality-ir'

// P0-1 fix: IdGenerator injected — no randomUUID() — identical evaluations produce identical manifests
export class ContextManifestBuilder {
  constructor(private readonly idGenerator: IdGenerator) {}

  build(
    pkg:          ContextPackage,
    report:       ContextQualityReport,
    decision:     ContextAdmissionDecision,
    contractHash: ContentHash,
    policyHash:   ContentHash,
    degradedDims: readonly string[],
  ): ContextManifest {
    const entries: ContextManifestEntry[] = pkg.items.map(item => ({
      itemId:          item.itemId,
      sourceRef:       item.sourceRef,
      representation:  item.representation,
      estimatedTokens: item.estimatedTokens,
      requirementRefs: item.relevance.requirementRefs,
    }))

    const totalTokens  = pkg.items.reduce((s, i) => s + i.estimatedTokens, 0)
    const totalSources = new Set(pkg.items.map(i => i.provenance.sourceId)).size

    const manifest: ContextManifest = {
      manifestId:        contextManifestId(this.idGenerator.nextId('manifest')),
      packageId:         pkg.packageId,
      reportId:          report.reportId,
      itemEntries:       entries,
      totalUsage:        { totalTokens, totalItems: pkg.items.length, totalSources },
      qualityVector:     report.vector,
      admissionDecision: decision,
      contractHash,
      packageHash:       pkg.packageHash,
      policyHash,
      ...(degradedDims.length > 0 ? { degradationReasons: degradedDims } : {}),
    }

    return manifest
  }
}
