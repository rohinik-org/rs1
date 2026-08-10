/**
 * Stage 16E T10 — Boundary 3: Clean external packed consumer
 *
 * Proves @rohinik-org/control works with zero workspace links.
 *
 * Setup:
 *   1. Start RS1 on port 19_801
 *   2. Pack @rohinik-org/control and @rohinik-org/control-protocol-v1 to /tmp
 *   3. Write a temp project with package.json depending on both tarballs via file:
 *   4. npm install in the temp dir (no workspace, no monorepo context)
 *   5. Run a Node.js ESM script that uses createControlClient to:
 *        - register artifact
 *        - approve
 *        - create workflow
 *        - apply (APPLIED outcome)
 *        - verify (PASSED)
 *        - evidence
 *      and asserts it reaches VERIFIED with no RS1 source imports
 *   6. Also assert the packed tarball has no workspace:* dependencies
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { RuntimeHost, defaultBootstrapPlan, BuiltinRegistry } from '@rohinik-org/runtime'
import { AiosServer } from '../server.js'
import { buildCoreCapability } from '@rohinik-org/capability-core'
import { MockReasoningProvider } from '@rohinik-org/mock-provider'
import { MockPolicyPort, MockCapabilityPort, MockBudgetPort } from '../agent-mock-ports.js'
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const PORT = 19_801
const BASE = `http://127.0.0.1:${PORT}`

const execFileAsync = promisify(execFile)

let host: RuntimeHost
let server: AiosServer

beforeAll(async () => {
  const registry = new BuiltinRegistry()
  const config = {
    configPath: '/tmp/boundary4-test.yaml',
    runtimeId:  'boundary4-001',
    runtime: {
      routing:   { mode: 'balanced' as const, explain: false, traceBuffer: 10 },
      resources: { maxConcurrentRequests: 20, timeoutMs: 30_000 },
      logLevel:  'error' as const,
    },
    extensions: { paths: [] },
    providers:  {},
    server:     { port: PORT, host: '127.0.0.1' },
  }
  const plan = {
    ...defaultBootstrapPlan(config, registry),
    socketPath:          '\\\\.\\pipe\\rohinik-boundary4',
    agentPolicyPort:     new MockPolicyPort(),
    agentCapabilityPort: new MockCapabilityPort(),
    agentBudgetPort:     new MockBudgetPort(),
  }
  host = new RuntimeHost(plan)
  await host.start()
  host.runtime.registerCapability(buildCoreCapability())
  host.runtime.registerProvider(new MockReasoningProvider())
  server = new AiosServer(host, { port: PORT, host: '127.0.0.1' })
  await server.listen()
}, 30_000)

afterAll(async () => {
  await server.close()
  await host.stop()
})

// ── Tarball paths ─────────────────────────────────────────────────────────────
// Tarballs vendored into server/vendor/ — built from workspace at T10 tag time.
const CONTROL_TARBALL  = resolve(import.meta.dirname, '../../vendor/rohinik-org-control-0.1.0.tgz').replaceAll('\\', '/')
const PROTOCOL_TARBALL = resolve(import.meta.dirname, '../../vendor/rohinik-org-control-protocol-v1-0.1.0.tgz').replaceAll('\\', '/')

const DIFF      = '--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-old\n+new\n'
const DIFF_HASH = createHash('sha256').update(DIFF, 'utf8').digest('hex')

const CONSUMER_SCRIPT = `
import { createControlClient } from '@rohinik-org/control'
import { ControlWorkflowState, VerificationStatus, MutationOutcome } from '@rohinik-org/control-protocol-v1'

const BASE = process.argv[2]
const DIFF = ${JSON.stringify(DIFF)}

function nowIso() { return new Date().toISOString() }
function cleanCp(id) {
  return {
    checkpointId: id, capturedAt: nowIso(), headRef: 'abc', workingTreeHash: 'wth', indexHash: 'ih',
    dirtyState: { hasUncommittedChanges: false, stagedFileCount: 0, unstagedFileCount: 0, untrackedFileCount: 0, files: [] },
  }
}

async function run() {
  const client = createControlClient(BASE)

  // Register artifact
  const artifact = await client.artifacts.create({
    actionType: 'FILE_PATCH', scope: '/boundary4/test', content: DIFF,
  })
  if (!artifact.id) throw new Error('No artifactId')
  console.log('ARTIFACT_OK id=' + artifact.id + ' hash=' + artifact.contentHash)

  // Approve
  const decision = await artifact.approve({ operatorId: 'boundary4-op', rationale: 'b4 test' })
  if (!decision.approvalId) throw new Error('No approvalId')
  if (decision.binding.contentHash !== artifact.contentHash) throw new Error('Hash mismatch in binding')
  console.log('APPROVAL_OK id=' + decision.approvalId)

  // Create workflow
  const wf = await client.workflows.create(artifact.id)
  if (wf.state !== ControlWorkflowState.DRAFT) throw new Error('Expected DRAFT, got ' + wf.state)
  console.log('WORKFLOW_OK id=' + wf.id)

  // Apply
  const cpId = 'cp-b4-1'
  const applyResult = await wf.apply({
    approvalId:  decision.approvalId,
    checkpoint:  cleanCp(cpId),
    applyRecord: {
      artifactId: artifact.id, appliedAt: nowIso(), method: 'git apply',
      exitCode: 0, stdout: '', stderr: '', mutationOutcome: MutationOutcome.APPLIED, checkpointId: cpId,
    },
  })
  if (wf.state !== ControlWorkflowState.APPLIED) throw new Error('Expected APPLIED, got ' + wf.state)
  console.log('APPLY_OK state=' + applyResult.state)

  // Verify PASSED
  const now = new Date()
  const vr = await wf.verify({
    command: 'pnpm test', verifierId: 'b4-verifier', verifierVersion: '1.0',
    startedAt: new Date(now.getTime() - 100).toISOString(), finishedAt: nowIso(),
    durationMs: 100, exitCode: 0, status: VerificationStatus.PASSED, checks: [], timedOut: false,
  })
  if (vr.status !== VerificationStatus.PASSED) throw new Error('Expected PASSED, got ' + vr.status)
  if (wf.state !== ControlWorkflowState.VERIFIED) throw new Error('Expected VERIFIED, got ' + wf.state)
  console.log('VERIFY_OK status=' + vr.status)

  // Evidence
  const ev = await wf.evidence()
  if (!Array.isArray(ev.events)) throw new Error('events not array')
  const kinds = ev.events.map(e => e.kind)
  if (!kinds.includes('workflow-created')) throw new Error('workflow-created missing from evidence')
  if (!kinds.includes('apply-completed')) throw new Error('apply-completed missing from evidence')
  console.log('EVIDENCE_OK events=' + ev.events.length)

  // Verify terminal state is VERIFIED
  await wf.reload()
  if (wf.state !== ControlWorkflowState.VERIFIED) throw new Error('After reload: expected VERIFIED, got ' + wf.state)
  console.log('RELOAD_OK state=' + wf.state)

  // Negative: unknown workflowId → ControlSdkError
  try {
    await client.workflows.load('no-such-workflow-xyz')
    throw new Error('Expected ControlSdkError for unknown workflow')
  } catch (err) {
    if (err?.constructor?.name !== 'ControlSdkError') throw new Error('Expected ControlSdkError, got ' + err?.constructor?.name)
    if (err.status !== 404) throw new Error('Expected status 404, got ' + err.status)
    console.log('NEGATIVE_404_OK')
  }

  console.log('ALL_PASS')
}

run().catch(err => {
  console.error('FAIL', err.message)
  process.exit(1)
})
`

describe('Boundary 4 — Clean external packed consumer (@rohinik-org/control)', () => {
  it('packed control SDK: lifecycle artifact → approve → workflow → apply → verify → evidence — zero workspace deps', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rs1-boundary4-'))
    try {
      // Minimal package.json — file: deps on tarballs, no workspace, no monorepo
      await writeFile(
        join(tmpDir, 'package.json'),
        JSON.stringify({
          name:    'boundary4-consumer',
          version: '1.0.0',
          type:    'module',
          dependencies: {
            '@rohinik-org/control':              `file:${CONTROL_TARBALL}`,
            '@rohinik-org/control-protocol-v1':  `file:${PROTOCOL_TARBALL}`,
          },
        }),
      )

      await execFileAsync(
        'npm',
        ['install', '--prefer-offline', '--no-fund', '--no-audit'],
        { cwd: tmpDir, timeout: 120_000, shell: true },
      )

      // Assert zero workspace:* deps in the packed tarball (pnpm replaces them at pack time)
      const controlPkg = await readFile(
        join(tmpDir, 'node_modules/@rohinik-org/control/package.json'), 'utf-8'
      ).then(s => JSON.parse(s))
      const deps = { ...controlPkg.dependencies, ...controlPkg.devDependencies }
      const workspaceDeps = Object.entries(deps).filter(([, v]) => String(v).startsWith('workspace:'))
      if (workspaceDeps.length > 0) {
        throw new Error(`workspace:* deps found in packed control: ${workspaceDeps.map(([k]) => k).join(', ')}`)
      }
      // Verify control-protocol-v1 is a resolved semver, not a workspace link
      const protocolVersion = deps['@rohinik-org/control-protocol-v1']
      expect(typeof protocolVersion).toBe('string')
      expect(String(protocolVersion).startsWith('workspace:')).toBe(false)

      const scriptPath = join(tmpDir, 'run.mjs')
      await writeFile(scriptPath, CONSUMER_SCRIPT)

      const { stdout } = await execFileAsync(
        process.execPath,
        [scriptPath, BASE],
        { cwd: tmpDir, timeout: 30_000 },
      )

      expect(stdout).toContain('ARTIFACT_OK')
      expect(stdout).toContain('APPROVAL_OK')
      expect(stdout).toContain('WORKFLOW_OK')
      expect(stdout).toContain('APPLY_OK')
      expect(stdout).toContain('VERIFY_OK')
      expect(stdout).toContain('EVIDENCE_OK')
      expect(stdout).toContain('RELOAD_OK')
      expect(stdout).toContain('NEGATIVE_404_OK')
      expect(stdout).toContain('ALL_PASS')
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  }, 180_000)
})
