import { describe, it, expect } from 'vitest'
import type { LearningTrigger, AcquisitionPolicy } from '@rohinik-org/compiler'
import { DEFAULT_ACQUISITION_POLICY } from '@rohinik-org/compiler'
import { CapabilityAcquisitionEngine } from '../engine/capability-acquisition-engine.js'
import { NullCapabilitySource } from '../sources/null-capability-source.js'
import { LocalPluginSource } from '../sources/local-plugin-source.js'
import { NullAcquisitionStore } from '../store/null-acquisition-store.js'
import type { Installer } from '@rohinik-org/installer'
import type { CapabilityCandidate } from '@rohinik-org/compiler'

class NullInstaller implements Installer {
  readonly calls: CapabilityCandidate[] = []
  async install(candidate: CapabilityCandidate): Promise<void> { this.calls.push(candidate) }
}
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function makeTrigger(overrides: Partial<LearningTrigger> = {}): LearningTrigger {
  return {
    kind: 'LearningTrigger',
    schemaVersion: '1.0',
    triggerId: 'trig-1',
    detectedAt: '2026-07-14T00:00:00.000Z',
    triggerKind: 'FAILURE_SPIKE',
    affectedSkillId: 'pdf.extract',
    evidence: { metric: 'failureRate', observedValue: 0.4, confidence: 0.9, confidenceMethod: 'EWMA', sampleSize: 50 },
    suggestedCommand: 'rhk acquire pdf',
    corpusWindowStart: '2026-07-01T00:00:00.000Z',
    corpusWindowEnd: '2026-07-14T00:00:00.000Z',
    recordCount: 50,
    ...overrides,
  }
}

describe('CapabilityAcquisitionEngine', () => {
  it('trigger → approval round-trip with NullSource produces empty approvals', async () => {
    const engine = new CapabilityAcquisitionEngine(
      [new NullCapabilitySource()],
      new NullAcquisitionStore(),
    )
    const result = await engine.acquire(makeTrigger())
    expect(result.triggerId).toBe('trig-1')
    expect(result.approvals).toHaveLength(0)
  })

  it('low-confidence policy blocks candidate', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'aios-test-'))
    try {
      const pluginDir = join(tmpRoot, '.aios', 'plugins', 'weak-plugin')
      await mkdir(pluginDir, { recursive: true })
      await writeFile(join(pluginDir, 'aios-plugin.json'), JSON.stringify({ name: 'weak-plugin', description: 'low confidence' }))

      const strictPolicy: AcquisitionPolicy = { ...DEFAULT_ACQUISITION_POLICY, minConfidenceForAutoApprove: 2.0 }
      const store = new NullAcquisitionStore()
      const engine = new CapabilityAcquisitionEngine(
        [new LocalPluginSource(tmpRoot)],
        store,
        strictPolicy,
      )
      const result = await engine.acquire(makeTrigger())
      expect(result.approvals[0]?.decision).toBe('DEFERRED')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('NullSource returns empty approvals list', async () => {
    const engine = new CapabilityAcquisitionEngine([new NullCapabilitySource()], new NullAcquisitionStore())
    const result = await engine.acquire(makeTrigger())
    expect(result.approvals).toEqual([])
  })

  it('APPROVED candidate triggers installer', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'aios-test-'))
    try {
      const pluginDir = join(tmpRoot, '.aios', 'plugins', 'good-plugin')
      await mkdir(pluginDir, { recursive: true })
      await writeFile(join(pluginDir, 'aios-plugin.json'), JSON.stringify({ name: 'good-plugin', description: 'approved' }))

      const installer = new NullInstaller()
      const engine = new CapabilityAcquisitionEngine(
        [new LocalPluginSource(tmpRoot)],
        new NullAcquisitionStore(),
        DEFAULT_ACQUISITION_POLICY,
        installer,
      )
      const result = await engine.acquire(makeTrigger())
      expect(result.approvals[0]?.decision).toBe('APPROVED')
      expect(installer.calls).toHaveLength(1)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('DEFERRED candidate does not trigger installer', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'aios-test-'))
    try {
      const pluginDir = join(tmpRoot, '.aios', 'plugins', 'net-plugin')
      await mkdir(pluginDir, { recursive: true })
      // Use npm scheme so policy defers it (requireHumanApprovalForNetwork=true)
      await writeFile(join(pluginDir, 'aios-plugin.json'), JSON.stringify({ name: 'net-plugin', description: 'network' }))

      // Override: high confidence but network policy defers
      const networkPolicy: AcquisitionPolicy = { ...DEFAULT_ACQUISITION_POLICY, autoApproveLocalSources: false, requireHumanApprovalForNetwork: true }
      const installer = new NullInstaller()
      // LocalPluginSource always uses file scheme → autoApproveLocalSources=false means no auto-approve but not DEFERRED either
      // Need to test via file source with autoApprove disabled → falls to last return APPROVED
      // Instead test with strict confidence
      const deferPolicy: AcquisitionPolicy = { ...DEFAULT_ACQUISITION_POLICY, minConfidenceForAutoApprove: 2.0 }
      const engine = new CapabilityAcquisitionEngine(
        [new LocalPluginSource(tmpRoot)],
        new NullAcquisitionStore(),
        deferPolicy,
        installer,
      )
      const result = await engine.acquire(makeTrigger())
      expect(result.approvals[0]?.decision).toBe('DEFERRED')
      expect(installer.calls).toHaveLength(0)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })
})
