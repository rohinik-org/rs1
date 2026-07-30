import type { RohinikPackageManifestV1, RohinikPackageType, PublisherCertification } from '@rohinik-org/package-manifest-ir'
import type { StructuredDoc } from './structural-validator.js'

// Helper to build optional-property objects without triggering exactOptionalPropertyTypes violations.
// We build as mutable partial then freeze.
type Mutable<T> = { -readonly [K in keyof T]: T[K] }

// Top-level accumulator: plain object that we cast to the IR type at the end.
// ponytail: cast via unknown avoids fighting exactOptionalPropertyTypes on optional field assignment
type TopAcc = Record<string, unknown>

// Produce a deep-frozen RohinikPackageManifestV1 from a structurally+semantically valid doc.
// provides[] sorted by capability ID, dependencies.npm[] sorted by name — determinism.
export function normalizeManifest(doc: StructuredDoc): RohinikPackageManifestV1 {
  const top: TopAcc = {
    schemaVersion: 'rohinik.package/v1',
    package: buildPkg(doc.package),
  }

  if (doc.publisher !== undefined) top['publisher'] = buildPublisher(doc.publisher)
  if (doc.runtime !== undefined) top['runtime'] = buildRuntime(doc.runtime)
  if (doc.provides !== undefined) top['provides'] = buildProvides(doc.provides)
  if (doc.consumes !== undefined) top['consumes'] = buildConsumes(doc.consumes)
  if (doc.dependencies !== undefined) top['dependencies'] = buildDependencies(doc.dependencies)
  if (doc.configuration !== undefined) top['configuration'] = buildConfiguration(doc.configuration)
  if (doc.permissions !== undefined) top['permissions'] = Object.freeze(doc.permissions)
  if (doc.health !== undefined) top['health'] = buildHealth(doc.health)
  if (doc.lifecycle !== undefined) top['lifecycle'] = buildLifecycle(doc.lifecycle)
  if (doc.metadata !== undefined) top['metadata'] = Object.freeze({ ...doc.metadata })

  return Object.freeze(top) as unknown as RohinikPackageManifestV1
}

function buildPkg(p: StructuredDoc['package']): RohinikPackageManifestV1['package'] {
  type Pkg = Mutable<RohinikPackageManifestV1['package']>
  const pkg: Pkg = {
    id: p.id,
    name: p.name,
    version: p.version,
    // semantic-validator ensures this is a valid RohinikPackageType
    type: p.type as RohinikPackageType,
  }
  if (p.description !== undefined) pkg.description = p.description
  if (p.license !== undefined) pkg.license = p.license
  if (p.homepage !== undefined) pkg.homepage = p.homepage
  if (p.repository !== undefined) pkg.repository = p.repository
  return Object.freeze(pkg)
}

function buildPublisher(p: NonNullable<StructuredDoc['publisher']>): NonNullable<RohinikPackageManifestV1['publisher']> {
  type Pub = Mutable<NonNullable<RohinikPackageManifestV1['publisher']>>
  const pub: Pub = { id: p.id, certification: p.certification as PublisherCertification }
  if (p.url !== undefined) pub.url = p.url
  return Object.freeze(pub)
}

function buildRuntime(r: NonNullable<StructuredDoc['runtime']>): NonNullable<RohinikPackageManifestV1['runtime']> {
  type Rt = Mutable<NonNullable<RohinikPackageManifestV1['runtime']>>
  const rt: Rt = { language: r.language }
  if (r.languageVersion !== undefined) rt.languageVersion = r.languageVersion
  if (r.entrypoint !== undefined) rt.entrypoint = r.entrypoint
  return Object.freeze(rt)
}

function buildProvides(provides: readonly NonNullable<StructuredDoc['provides']>[number][]): NonNullable<RohinikPackageManifestV1['provides']> {
  type Cap = Mutable<NonNullable<RohinikPackageManifestV1['provides']>[number]>
  return Object.freeze(
    [...provides]
      .sort((a, b) => a.capability.localeCompare(b.capability))
      .map(c => {
        const cap: Cap = { capability: c.capability, version: c.version }
        if (c.description !== undefined) cap.description = c.description
        if (c.deprecated !== undefined) cap.deprecated = c.deprecated
        return Object.freeze(cap)
      }),
  )
}

function buildConsumes(consumes: readonly NonNullable<StructuredDoc['consumes']>[number][]): NonNullable<RohinikPackageManifestV1['consumes']> {
  type Con = Mutable<NonNullable<RohinikPackageManifestV1['consumes']>[number]>
  return Object.freeze(
    consumes.map(c => {
      const con: Con = { capability: c.capability, versionRange: c.versionRange }
      if (c.optional !== undefined) con.optional = c.optional
      return Object.freeze(con)
    }),
  )
}

function buildDependencies(deps: NonNullable<StructuredDoc['dependencies']>): NonNullable<RohinikPackageManifestV1['dependencies']> {
  type Deps = Mutable<NonNullable<RohinikPackageManifestV1['dependencies']>>
  type NpmDep = Mutable<NonNullable<NonNullable<RohinikPackageManifestV1['dependencies']>['npm']>[number]>
  const d: Deps = {}
  if (deps.rohinik !== undefined) d.rohinik = Object.freeze([...deps.rohinik])
  if (deps.npm !== undefined) {
    d.npm = Object.freeze(
      [...deps.npm]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(nd => {
          const dep: NpmDep = { name: nd.name, version: nd.version }
          if (nd.optional !== undefined) dep.optional = nd.optional
          return Object.freeze(dep)
        }),
    )
  }
  return Object.freeze(d)
}

function buildConfiguration(cfg: NonNullable<StructuredDoc['configuration']>): NonNullable<RohinikPackageManifestV1['configuration']> {
  type Cfg = Mutable<NonNullable<RohinikPackageManifestV1['configuration']>>
  type Sec = Mutable<NonNullable<NonNullable<RohinikPackageManifestV1['configuration']>['secrets']>[number]>
  type Env = Mutable<NonNullable<NonNullable<RohinikPackageManifestV1['configuration']>['environment']>[number]>
  const c: Cfg = {}
  if (cfg.secrets !== undefined) {
    c.secrets = Object.freeze(cfg.secrets.map(s => {
      const sec: Sec = { name: s.name, required: s.required }
      if (s.description !== undefined) sec.description = s.description
      return Object.freeze(sec)
    }))
  }
  if (cfg.environment !== undefined) {
    c.environment = Object.freeze(cfg.environment.map(e => {
      const env: Env = { name: e.name, required: e.required }
      if (e.default !== undefined) env.default = e.default
      if (e.description !== undefined) env.description = e.description
      return Object.freeze(env)
    }))
  }
  return Object.freeze(c)
}

function buildHealth(h: NonNullable<StructuredDoc['health']>): NonNullable<RohinikPackageManifestV1['health']> {
  type H = Mutable<NonNullable<RohinikPackageManifestV1['health']>>
  const health: H = {}
  if (h.startup !== undefined) health.startup = h.startup
  if (h.readiness !== undefined) health.readiness = h.readiness
  if (h.liveness !== undefined) health.liveness = h.liveness
  return Object.freeze(health)
}

function buildLifecycle(lc: NonNullable<StructuredDoc['lifecycle']>): NonNullable<RohinikPackageManifestV1['lifecycle']> {
  type LC = Mutable<NonNullable<RohinikPackageManifestV1['lifecycle']>>
  const lifecycle: LC = {}
  if (lc.idempotentShutdown !== undefined) lifecycle.idempotentShutdown = lc.idempotentShutdown
  if (lc.gracefulShutdownTimeoutMs !== undefined) lifecycle.gracefulShutdownTimeoutMs = lc.gracefulShutdownTimeoutMs
  return Object.freeze(lifecycle)
}
