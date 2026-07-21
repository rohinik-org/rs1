import { createHash } from 'node:crypto'
import { basename, extname } from 'node:path'
import {
  KNOWLEDGE_IR_VERSION,
  type KnowledgeFragment,
  type KnowledgeNode,
  type KnowledgeEdge,
  type ProcedureDefinition,
  type KnowledgeSource,
  type Provenance,
  type KnowledgeEvidence,
  type EntityKind,
  type KnowledgePrimitive,
  KnowledgeRelationship,
} from '@rohinik-org/knowledge'

export type { KnowledgeFragment, KnowledgeSource }

export interface DocumentExtractor {
  readonly documentType: string
  readonly filePatterns: ReadonlyArray<string>
  extract(content: string, source: KnowledgeSource): KnowledgeFragment
}

export interface ExtractorProvider {
  readonly id: string
  readonly type: 'builtin' | 'plugin'
  load(): Promise<ReadonlyArray<DocumentExtractor>>
}

export class DocumentClassifier {
  private readonly extractors: DocumentExtractor[] = []

  register(extractor: DocumentExtractor): void {
    this.extractors.push(extractor)
  }

  classify(filePath: string, content: string): DocumentExtractor | undefined {
    const name = basename(filePath)
    const ext = extname(filePath).toLowerCase()
    return this.extractors.find(e =>
      e.filePatterns.some(p => {
        if (p.startsWith('*.')) return ext === p.slice(1)
        return name === p
      })
    ) ?? this.extractors.find(e => content.length > 0 && e.documentType === 'readme' && /\.md$/i.test(filePath))
  }
}

export class EntityExtractionPipeline {
  private readonly extractors: DocumentExtractor[] = []
  private readonly classifier = new DocumentClassifier()

  register(extractor: DocumentExtractor): void {
    this.extractors.push(extractor)
    this.classifier.register(extractor)
  }

  extract(filePath: string, content: string): KnowledgeFragment {
    const source: KnowledgeSource = { type: 'filesystem', id: filePath }
    const extractor = this.classifier.classify(filePath, content)
    if (!extractor) return _emptyFragment(source, filePath)
    return extractor.extract(content, source)
  }
}

export class ExtractorBootstrap {
  constructor(private readonly providers: ReadonlyArray<ExtractorProvider>) {}

  async load(pipeline: EntityExtractionPipeline): Promise<void> {
    for (const provider of this.providers) {
      const extractors = await provider.load()
      for (const e of extractors) pipeline.register(e)
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _id(obj: unknown): string {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex')
}

function _prov(extractorId: string): Provenance {
  return { observationIds: [], fragmentIds: [], workflowIds: [], extractorId }
}

function _ev(source: KnowledgeSource, method: string): KnowledgeEvidence {
  return { source, observationCount: 1, extractionMethod: method }
}

function _node(
  label: string,
  primitive: KnowledgePrimitive,
  source: KnowledgeSource,
  extractorId: string,
  kind?: EntityKind,
  attrs?: Record<string, string>,
): KnowledgeNode {
  return {
    id: _id({ label, primitive, kind, source: source.id }),
    primitive,
    kind,
    label,
    source,
    certainty: 1.0,
    evidence: [_ev(source, extractorId)],
    provenance: _prov(extractorId),
    attributes: attrs ?? {},
  }
}

function _edge(
  sourceNodeId: string,
  targetNodeId: string,
  relationship: (typeof KnowledgeRelationship)[keyof typeof KnowledgeRelationship],
  source: KnowledgeSource,
  extractorId: string,
): KnowledgeEdge {
  return {
    id: _id({ sourceNodeId, targetNodeId, relationship }),
    sourceNodeId,
    targetNodeId,
    relationship,
    certainty: 1.0,
    evidence: [_ev(source, extractorId)],
    provenance: _prov(extractorId),
  }
}

function _fragment(
  source: KnowledgeSource,
  extractorId: string,
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  procedures: ProcedureDefinition[] = [],
): KnowledgeFragment {
  return {
    schemaVersion: KNOWLEDGE_IR_VERSION,
    fragmentId: _id({ source: source.id, nodes: nodes.map(n => n.id) }),
    source,
    provenance: _prov(extractorId),
    extractedAt: new Date(),
    nodes,
    edges,
    procedures,
  }
}

function _emptyFragment(source: KnowledgeSource, filePath: string): KnowledgeFragment {
  return _fragment(source, 'unknown', [], [])
}

function _procedure(
  label: string,
  command: string,
  source: KnowledgeSource,
  extractorId: string,
): ProcedureDefinition {
  return {
    id: _id({ label, command, source: source.id }),
    primitive: 'Procedure',
    label,
    source,
    certainty: 1.0,
    evidence: [_ev(source, extractorId)],
    provenance: _prov(extractorId),
    attributes: { command },
    steps: [{ position: 0, capabilityIds: ['local-shell:execute'], inputTemplate: { command }, description: label }],
    requiredCapabilities: ['local-shell:execute'],
    inputs: [],
    outputs: [],
    sideEffects: ['shell:execute'],
  }
}

// ── Built-in Extractors ────────────────────────────────────────────────────

const EXTRACTOR_ID_PKG = 'package-json-extractor'

export class PackageJsonExtractor implements DocumentExtractor {
  readonly documentType = 'package-json'
  readonly filePatterns = ['package.json']

  extract(content: string, source: KnowledgeSource): KnowledgeFragment {
    let pkg: Record<string, unknown>
    try { pkg = JSON.parse(content) } catch { return _fragment(source, EXTRACTOR_ID_PKG, [], []) }

    const nodes: KnowledgeNode[] = []
    const edges: KnowledgeEdge[] = []
    const procedures: ProcedureDefinition[] = []

    const name = typeof pkg.name === 'string' ? pkg.name : 'unknown'
    const root = _node(name, 'Entity', source, EXTRACTOR_ID_PKG, 'Package', {
      version: typeof pkg.version === 'string' ? pkg.version : '',
    })
    nodes.push(root)

    for (const section of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
      const deps = pkg[section]
      if (typeof deps === 'object' && deps !== null) {
        for (const depName of Object.keys(deps as object)) {
          const dep = _node(depName, 'Entity', source, EXTRACTOR_ID_PKG, 'Library')
          nodes.push(dep)
          edges.push(_edge(root.id, dep.id, KnowledgeRelationship.DEPENDS_ON, source, EXTRACTOR_ID_PKG))
        }
      }
    }

    const scripts = pkg.scripts
    if (typeof scripts === 'object' && scripts !== null) {
      for (const [scriptName, cmd] of Object.entries(scripts as Record<string, string>)) {
        procedures.push(_procedure(scriptName, cmd, source, EXTRACTOR_ID_PKG))
      }
    }

    return _fragment(source, EXTRACTOR_ID_PKG, nodes, edges, procedures)
  }
}

const EXTRACTOR_ID_DOCKER = 'dockerfile-extractor'

export class DockerfileExtractor implements DocumentExtractor {
  readonly documentType = 'dockerfile'
  readonly filePatterns = ['Dockerfile', 'dockerfile']

  extract(content: string, source: KnowledgeSource): KnowledgeFragment {
    const nodes: KnowledgeNode[] = []
    const edges: KnowledgeEdge[] = []
    const procedures: ProcedureDefinition[] = []

    const lines = content.split('\n')
    for (const line of lines) {
      const from = line.match(/^FROM\s+(\S+)/i)
      if (from) {
        const baseImage = from[1]
        nodes.push(_node(baseImage, 'Entity', source, EXTRACTOR_ID_DOCKER, 'Tool', { role: 'base-image' }))
      }
      const run = line.match(/^RUN\s+(.+)/i)
      if (run) {
        procedures.push(_procedure(`docker-run: ${run[1].slice(0, 40)}`, run[1], source, EXTRACTOR_ID_DOCKER))
      }
    }

    const runtime = _node('container-runtime', 'Concept', source, EXTRACTOR_ID_DOCKER)
    nodes.push(runtime)

    return _fragment(source, EXTRACTOR_ID_DOCKER, nodes, edges, procedures)
  }
}

const EXTRACTOR_ID_TS = 'tsconfig-extractor'

export class TsconfigExtractor implements DocumentExtractor {
  readonly documentType = 'tsconfig'
  readonly filePatterns = ['tsconfig.json', 'tsconfig.*.json']

  extract(content: string, source: KnowledgeSource): KnowledgeFragment {
    let cfg: Record<string, unknown>
    try { cfg = JSON.parse(content) } catch { return _fragment(source, EXTRACTOR_ID_TS, [], []) }

    const nodes: KnowledgeNode[] = []
    const edges: KnowledgeEdge[] = []
    const opts = cfg.compilerOptions as Record<string, unknown> | undefined

    const target = typeof opts?.target === 'string' ? opts.target : 'unknown'
    const targetNode = _node(target, 'Concept', source, EXTRACTOR_ID_TS, undefined, { role: 'compiler-target' })
    nodes.push(targetNode)

    const tsNode = _node('typescript', 'Entity', source, EXTRACTOR_ID_TS, 'Language')
    nodes.push(tsNode)
    edges.push(_edge(tsNode.id, targetNode.id, KnowledgeRelationship.CONFIGURES, source, EXTRACTOR_ID_TS))

    return _fragment(source, EXTRACTOR_ID_TS, nodes, edges)
  }
}

const EXTRACTOR_ID_README = 'readme-extractor'

export class ReadmeExtractor implements DocumentExtractor {
  readonly documentType = 'readme'
  readonly filePatterns = ['README.md', 'readme.md', '*.md']

  extract(content: string, source: KnowledgeSource): KnowledgeFragment {
    const nodes: KnowledgeNode[] = []
    const procedures: ProcedureDefinition[] = []

    // Extract project concept from first heading
    const heading = content.match(/^#\s+(.+)/m)
    if (heading) nodes.push(_node(heading[1], 'Concept', source, EXTRACTOR_ID_README, undefined, { role: 'project-purpose' }))

    // Extract inline code blocks as procedures (```sh / ```bash)
    const codeBlocks = content.matchAll(/```(?:sh|bash|shell)\n([\s\S]*?)```/gm)
    for (const block of codeBlocks) {
      const lines = block[1].trim().split('\n').filter(l => l.trim() && !l.startsWith('#'))
      for (const line of lines) {
        procedures.push(_procedure(line.slice(0, 60), line, source, EXTRACTOR_ID_README))
      }
    }

    // Extract tool mentions from backtick spans
    const toolMentions = content.matchAll(/`([a-zA-Z][a-zA-Z0-9_-]+)`/g)
    const seen = new Set<string>()
    for (const m of toolMentions) {
      if (!seen.has(m[1])) {
        seen.add(m[1])
        nodes.push(_node(m[1], 'Entity', source, EXTRACTOR_ID_README, 'Tool'))
      }
    }

    return _fragment(source, EXTRACTOR_ID_README, nodes, [], procedures)
  }
}

const EXTRACTOR_ID_YAML = 'yaml-workflow-extractor'

export class YamlWorkflowExtractor implements DocumentExtractor {
  readonly documentType = 'yaml-workflow'
  readonly filePatterns = ['*.yml', '*.yaml']

  extract(content: string, source: KnowledgeSource): KnowledgeFragment {
    const nodes: KnowledgeNode[] = []
    const procedures: ProcedureDefinition[] = []

    // Detect GitHub Actions: has 'on:' and 'jobs:' keys
    const isGhActions = /^on:/m.test(content) && /^jobs:/m.test(content)
    // Detect K8s: has 'apiVersion:' and 'kind:' keys
    const isK8s = /^apiVersion:/m.test(content) && /^kind:/m.test(content)

    if (isGhActions) {
      nodes.push(_node('github-actions', 'Entity', source, EXTRACTOR_ID_YAML, 'Tool'))
      const jobNames = content.matchAll(/^  ([a-zA-Z][a-zA-Z0-9_-]+):\s*$/gm)
      for (const m of jobNames) {
        procedures.push(_procedure(`gh-job:${m[1]}`, m[1], source, EXTRACTOR_ID_YAML))
      }
    } else if (isK8s) {
      const kindMatch = content.match(/^kind:\s+(\S+)/m)
      if (kindMatch) nodes.push(_node(kindMatch[1], 'Entity', source, EXTRACTOR_ID_YAML, 'Tool'))
    } else {
      nodes.push(_node('yaml-config', 'Concept', source, EXTRACTOR_ID_YAML))
    }

    return _fragment(source, EXTRACTOR_ID_YAML, nodes, [], procedures)
  }
}

const EXTRACTOR_ID_SQL = 'sql-extractor'

export class SqlExtractor implements DocumentExtractor {
  readonly documentType = 'sql'
  readonly filePatterns = ['*.sql']

  extract(content: string, source: KnowledgeSource): KnowledgeFragment {
    const nodes: KnowledgeNode[] = []
    const edges: KnowledgeEdge[] = []
    const procedures: ProcedureDefinition[] = []

    const tables = content.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi)
    const dbNode = _node('database', 'Entity', source, EXTRACTOR_ID_SQL, 'Database')
    const tableNodes: KnowledgeNode[] = []

    for (const m of tables) {
      const t = _node(m[1], 'Entity', source, EXTRACTOR_ID_SQL, 'Database', { role: 'table' })
      tableNodes.push(t)
      edges.push(_edge(dbNode.id, t.id, KnowledgeRelationship.CONTAINS, source, EXTRACTOR_ID_SQL))
    }

    if (tableNodes.length > 0) nodes.push(dbNode, ...tableNodes)

    // Migrations are procedures
    const migrations = content.matchAll(/--\s*migration:\s*(.+)/gi)
    for (const m of migrations) {
      procedures.push(_procedure(`migration:${m[1].trim()}`, m[1].trim(), source, EXTRACTOR_ID_SQL))
    }

    return _fragment(source, EXTRACTOR_ID_SQL, nodes, edges, procedures)
  }
}

export class BuiltinExtractorProvider implements ExtractorProvider {
  readonly id = 'builtin'
  readonly type = 'builtin' as const

  async load(): Promise<ReadonlyArray<DocumentExtractor>> {
    return [
      new PackageJsonExtractor(),
      new DockerfileExtractor(),
      new TsconfigExtractor(),
      new ReadmeExtractor(),
      new YamlWorkflowExtractor(),
      new SqlExtractor(),
    ]
  }
}
