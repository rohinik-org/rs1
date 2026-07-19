import { createHash, randomUUID } from 'node:crypto'
import type { LLMClient, CompilerContext, ExecutionReport } from '@rohinik-org/compiler'
import {
  IntentCompiler, SequentialPlanner, ExecutionGraphBuilder,
  Verifier, InMemoryArtifactStore,
} from '@rohinik-org/compiler'
import { RohinikHttpClient } from '@rohinik-org/cli/client'
import { ContextAssembler } from './context-assembler.js'
import { ConsoleClarificationHandler, type UserIO } from './clarification-handler.js'
import { formatPlan } from './plan-presenter.js'
import { formatResult } from './result-presenter.js'

export interface ShellRunOptions {
  baseUrl: string
  llm: LLMClient
  io: UserIO
}

export interface ShellResult {
  readonly success: boolean
  readonly output: string
  readonly executionReport?: ExecutionReport
}

export async function runShell(input: string, opts: ShellRunOptions): Promise<ShellResult> {
  const { baseUrl, llm, io } = opts

  const assembler = new ContextAssembler(baseUrl)
  const store = new InMemoryArtifactStore()
  const compiler = new IntentCompiler(llm)
  const planner = new SequentialPlanner()
  const egb = new ExecutionGraphBuilder()
  const verifier = new Verifier(baseUrl)
  const clarificationHandler = new ConsoleClarificationHandler(io)

  // 1. Assemble context
  let ctx: CompilerContext
  try {
    ctx = await assembler.assemble()
  } catch (err) {
    return { success: false, output: `Cannot reach runtime at ${baseUrl}: ${err instanceof Error ? err.message : String(err)}` }
  }

  // 2. Compile with clarification loop (max 3 attempts)
  let intentIR
  let currentInput = input
  for (let attempt = 0; attempt < 3; attempt++) {
    const compileResult = await compiler.compile(currentInput, ctx)
    if (compileResult.ok) { intentIR = compileResult.intentIR; break }
    const answers = await clarificationHandler.handle(compileResult.clarification)
    currentInput = `${input} [clarification: ${Object.values(answers).join(' ')}]`
  }
  if (!intentIR) return { success: false, output: 'Could not resolve intent after clarification.' }
  await store.put(intentIR)

  // 3. Plan
  const planIR = await planner.plan(intentIR, ctx.system.capabilities)
  await store.put(planIR)
  io.print(formatPlan(planIR))

  // 4. Build execution graph
  const executionGraph = egb.build(planIR)
  await store.put(executionGraph)

  // 5. Verify
  const verificationReport = await verifier.verify(executionGraph)
  await store.put(verificationReport)

  if (verificationReport.status === 'FAILED') {
    const findings = verificationReport.findings.map(f => `  - ${f.message}`).join('\n')
    return { success: false, output: `Execution blocked by verification:\n${findings}` }
  }

  if (verificationReport.status === 'REQUIRES_CONFIRMATION') {
    io.print('\n[Verification warnings — confirmation required]')
    for (const f of verificationReport.findings) io.print(`  ${f.severity}: ${f.message}`)
    const answer = await io.ask('Proceed with execution? (yes/no)', ['yes', 'no'])
    if (answer.toLowerCase() !== 'yes') return { success: false, output: 'Execution cancelled by user.' }
  }

  // 6. Execute via ARP
  const client = new RohinikHttpClient(baseUrl)
  const stepReports = []
  const outputs: Record<string, unknown> = {}
  const failures = []

  for (const node of executionGraph.nodes.filter(n => n.command.operation === 'EXECUTE')) {
    try {
      const response = await client.execute({
        content: String(node.command.arguments['content'] ?? ''),
        contentType: String(node.command.arguments['contentType'] ?? 'TEXT'),
        ...(node.command.arguments['intentHint'] ? { intentHint: String(node.command.arguments['intentHint']) } : {}),
      })
      stepReports.push({
        nodeId: node.nodeId, planStepId: node.planStepId, requestId: response.requestId,
        status: 'SUCCESS' as const, output: response.output, skillId: response.skillId,
        ...(response.tierId !== undefined ? { tierId: response.tierId } : {}),
        executionTimeMs: response.executionTimeMs,
      })
      if (response.output !== undefined) outputs[node.planStepId] = response.output
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      stepReports.push({ nodeId: node.nodeId, planStepId: node.planStepId, requestId: randomUUID(), status: 'FAILED' as const })
      failures.push({ nodeId: node.nodeId, planStepId: node.planStepId, errorCode: 'EXECUTION_ERROR', message: msg, retried: false })
    }
  }

  const executionStatus = failures.length === 0 ? 'SUCCESS' as const
    : stepReports.some(r => r.status === 'SUCCESS') ? 'PARTIAL' as const
    : 'FAILED' as const

  const now = new Date().toISOString()
  const reportBody = { stepReports, outputs, failures, status: executionStatus }
  const checksum = createHash('sha256').update(JSON.stringify(reportBody)).digest('hex')

  const executionReport: ExecutionReport = {
    meta: { artifactId: checksum, schemaVersion: '1.0', kind: 'ExecutionReport', createdAt: now, producer: '@rohinik-org/shell@0.1.0' },
    provenance: { systemSnapshotId: ctx.system.snapshotId, parentArtifacts: [{ artifactId: executionGraph.meta.artifactId, kind: 'ExecutionGraph' }], sessionId: ctx.session.sessionId },
    integrity: { checksum },
    lifecycle: { state: 'ACTIVE' },
    startedAt: now, endedAt: new Date().toISOString(),
    status: executionStatus, stepReports, outputs, artifacts: [], warnings: [], failures,
  }

  await store.put(executionReport)
  return { success: executionStatus !== 'FAILED', output: formatResult(executionReport, verificationReport), executionReport }
}
