import { describe, it, expect } from 'vitest'
import {
  PackageJsonExtractor,
  DockerfileExtractor,
  TsconfigExtractor,
  ReadmeExtractor,
  YamlWorkflowExtractor,
  SqlExtractor,
  DocumentClassifier,
  EntityExtractionPipeline,
  ExtractorBootstrap,
  BuiltinExtractorProvider,
} from '../index.js'
import type { KnowledgeSource } from '../index.js'

const src = (id = 'test'): KnowledgeSource => ({ type: 'filesystem', id })

describe('PackageJsonExtractor', () => {
  const ext = new PackageJsonExtractor()

  it('extracts package name as Entity/Package', () => {
    const f = ext.extract(JSON.stringify({ name: 'my-app', version: '1.0.0' }), src('package.json'))
    const pkg = f.nodes.find(n => n.primitive === 'Entity' && n.kind === 'Package')
    expect(pkg?.label).toBe('my-app')
  })

  it('extracts dependencies as Entity/Library with DEPENDS_ON edges', () => {
    const f = ext.extract(JSON.stringify({ name: 'app', dependencies: { react: '^18' } }), src('package.json'))
    const dep = f.nodes.find(n => n.label === 'react')
    expect(dep?.kind).toBe('Library')
    expect(f.edges.some(e => e.relationship === 'DEPENDS_ON')).toBe(true)
  })

  it('extracts scripts as ProcedureDefinitions', () => {
    const f = ext.extract(JSON.stringify({ name: 'app', scripts: { build: 'tsc' } }), src('package.json'))
    expect(f.procedures.some(p => p.label === 'build')).toBe(true)
  })

  it('returns empty fragment for invalid JSON', () => {
    const f = ext.extract('not json', src('package.json'))
    expect(f.nodes).toHaveLength(0)
  })
})

describe('DockerfileExtractor', () => {
  const ext = new DockerfileExtractor()
  const dockerfile = 'FROM node:22\nRUN npm install\nRUN npm run build'

  it('extracts base image as Entity/Tool', () => {
    const f = ext.extract(dockerfile, src('Dockerfile'))
    expect(f.nodes.some(n => n.label === 'node:22' && n.kind === 'Tool')).toBe(true)
  })

  it('extracts RUN commands as procedures', () => {
    const f = ext.extract(dockerfile, src('Dockerfile'))
    expect(f.procedures.length).toBeGreaterThan(0)
  })
})

describe('TsconfigExtractor', () => {
  const ext = new TsconfigExtractor()

  it('extracts compiler target as Concept', () => {
    const f = ext.extract(JSON.stringify({ compilerOptions: { target: 'ES2022' } }), src('tsconfig.json'))
    expect(f.nodes.some(n => n.label === 'ES2022' && n.primitive === 'Concept')).toBe(true)
  })

  it('extracts CONFIGURES edge', () => {
    const f = ext.extract(JSON.stringify({ compilerOptions: { target: 'ES2022' } }), src('tsconfig.json'))
    expect(f.edges.some(e => e.relationship === 'CONFIGURES')).toBe(true)
  })
})

describe('ReadmeExtractor', () => {
  const ext = new ReadmeExtractor()
  const readme = `# My Project\n\nInstall with \`pnpm install\`.\n\n\`\`\`bash\npnpm build\n\`\`\``

  it('extracts heading as Concept', () => {
    const f = ext.extract(readme, src('README.md'))
    expect(f.nodes.some(n => n.label === 'My Project' && n.primitive === 'Concept')).toBe(true)
  })

  it('extracts bash block commands as procedures', () => {
    const f = ext.extract(readme, src('README.md'))
    expect(f.procedures.some(p => p.label.includes('pnpm build'))).toBe(true)
  })
})

describe('YamlWorkflowExtractor', () => {
  const ext = new YamlWorkflowExtractor()

  it('detects GitHub Actions and extracts job as procedure', () => {
    const yaml = `on:\n  push:\njobs:\n  build:\n    runs-on: ubuntu-latest`
    const f = ext.extract(yaml, src('.github/workflows/ci.yml'))
    expect(f.procedures.some(p => p.label.includes('build'))).toBe(true)
  })

  it('detects K8s kind as Entity', () => {
    const yaml = `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: app`
    const f = ext.extract(yaml, src('deployment.yaml'))
    expect(f.nodes.some(n => n.label === 'Deployment')).toBe(true)
  })
})

describe('SqlExtractor', () => {
  const ext = new SqlExtractor()

  it('extracts CREATE TABLE as Entity/Database with CONTAINS edge', () => {
    const sql = `CREATE TABLE users (id INT, name TEXT);\nCREATE TABLE posts (id INT);`
    const f = ext.extract(sql, src('schema.sql'))
    expect(f.nodes.some(n => n.label === 'users')).toBe(true)
    expect(f.edges.some(e => e.relationship === 'CONTAINS')).toBe(true)
  })

  it('extracts migration comments as procedures', () => {
    const sql = `-- migration: add-users-table\nCREATE TABLE users (id INT);`
    const f = ext.extract(sql, src('migration.sql'))
    expect(f.procedures.some(p => p.label.includes('add-users-table'))).toBe(true)
  })
})

describe('DocumentClassifier', () => {
  it('classifies by filename', () => {
    const cls = new DocumentClassifier()
    const ext = new PackageJsonExtractor()
    cls.register(ext)
    expect(cls.classify('package.json', '{}')).toBe(ext)
  })

  it('classifies by extension', () => {
    const cls = new DocumentClassifier()
    const ext = new SqlExtractor()
    cls.register(ext)
    expect(cls.classify('schema.sql', 'CREATE TABLE x...')).toBe(ext)
  })

  it('returns undefined for unknown file', () => {
    const cls = new DocumentClassifier()
    expect(cls.classify('unknown.xyz', '')).toBeUndefined()
  })

  it('classifies Dockerfile without extension', () => {
    const cls = new DocumentClassifier()
    const ext = new DockerfileExtractor()
    cls.register(ext)
    expect(cls.classify('Dockerfile', 'FROM node:22')).toBe(ext)
  })
})

describe('EntityExtractionPipeline + ExtractorBootstrap', () => {
  it('pipeline extracts from known file type', async () => {
    const pipeline = new EntityExtractionPipeline()
    const bootstrap = new ExtractorBootstrap([new BuiltinExtractorProvider()])
    await bootstrap.load(pipeline)
    const f = pipeline.extract('package.json', JSON.stringify({ name: 'test' }))
    expect(f.nodes.length).toBeGreaterThan(0)
  })

  it('pipeline returns empty fragment for unrecognized file', async () => {
    const pipeline = new EntityExtractionPipeline()
    await new ExtractorBootstrap([new BuiltinExtractorProvider()]).load(pipeline)
    const f = pipeline.extract('mystery.xyz', 'content')
    expect(f.nodes).toHaveLength(0)
  })

  it('pipeline uses correct extractor per file type', async () => {
    const pipeline = new EntityExtractionPipeline()
    await new ExtractorBootstrap([new BuiltinExtractorProvider()]).load(pipeline)
    const f = pipeline.extract('schema.sql', 'CREATE TABLE users (id INT);')
    expect(f.nodes.some(n => n.label === 'users')).toBe(true)
  })

  it('bootstrap loads all 6 builtin extractors', async () => {
    const provider = new BuiltinExtractorProvider()
    const extractors = await provider.load()
    expect(extractors.length).toBe(6)
  })

  it('schemaVersion matches KNOWLEDGE_IR_VERSION', async () => {
    const pipeline = new EntityExtractionPipeline()
    await new ExtractorBootstrap([new BuiltinExtractorProvider()]).load(pipeline)
    const f = pipeline.extract('package.json', JSON.stringify({ name: 'test' }))
    expect(f.schemaVersion).toBe(1)
  })
})
