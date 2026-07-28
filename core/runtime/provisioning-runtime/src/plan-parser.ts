import type { AuthorizedCapabilityResolutionPlan } from '@rohinik-org/provisioning-ir'
import { PlanStructureError } from '@rohinik-org/provisioning-ir'

const VALID_ACTION_KINDS = new Set([
  'fetch-artifact',
  'install-rohinik-package',
  'install-language-package',
  'install-model-artifact',
  'provision-infrastructure',
  'apply-configuration-template',
  'register-provider',
  'validate-provider',
  'activate-provider',
])

const SHA256_HEX = /^[0-9a-f]{64}$/
// sha512- followed by base64 chars (A-Z, a-z, 0-9, +, /, =)
const SRI_BASE64 = /^sha512-[A-Za-z0-9+/]+=*$/

export class AuthorizedPlanParser {
  parse(input: unknown): AuthorizedCapabilityResolutionPlan {
    const d: string[] = []
    if (typeof input !== 'object' || input === null) {
      throw new PlanStructureError(['input is not an object'], 'Plan structure validation failed: 1 error(s)')
    }
    const p = input as Record<string, unknown>

    if (p['kind'] !== 'authorized-capability-resolution-plan') {
      d.push(`kind must be 'authorized-capability-resolution-plan', got ${JSON.stringify(p['kind'])}`)
    }
    if (p['schemaVersion'] !== 1) {
      d.push(`schemaVersion must be 1, got ${JSON.stringify(p['schemaVersion'])}`)
    }

    // Validate authorizationProof shape
    const proof = p['authorizationProof']
    if (typeof proof !== 'object' || proof === null) {
      d.push('authorizationProof is missing or not an object')
    } else {
      const pr = proof as Record<string, unknown>
      const algo = pr['algorithm']
      if (algo === 'in-process-token') {
        if (typeof pr['token'] !== 'string') d.push('in-process-token proof must have token: string')
      } else if (algo === 'ed25519') {
        if (typeof pr['keyId'] !== 'string') d.push('ed25519 proof must have keyId: string')
        if (pr['signatureEncoding'] !== 'base64') d.push('ed25519 proof must have signatureEncoding: base64')
        if (typeof pr['signature'] !== 'string') d.push('ed25519 proof must have signature: string')
      } else {
        d.push(`authorizationProof.algorithm must be 'in-process-token' or 'ed25519', got ${JSON.stringify(algo)}`)
      }
    }

    // Validate verifiedArtifacts — collect artifactAuthorizationIds
    const artifactAuthIds = new Set<string>()
    const artifacts = p['verifiedArtifacts']
    if (Array.isArray(artifacts)) {
      for (const art of artifacts) {
        if (typeof art === 'object' && art !== null) {
          const a = art as Record<string, unknown>
          if (typeof a['artifactAuthorizationId'] === 'string') {
            artifactAuthIds.add(a['artifactAuthorizationId'] as string)
          }
          // Validate digest
          const dig = a['digest']
          if (typeof dig === 'object' && dig !== null) {
            const dg = dig as Record<string, unknown>
            if (dg['algorithm'] === 'sha256') {
              if (dg['encoding'] !== 'hex') d.push(`sha256 digest must have encoding: 'hex'`)
              else if (typeof dg['value'] !== 'string' || !SHA256_HEX.test(dg['value'] as string)) {
                d.push(`sha256 digest value must be 64 lowercase hex chars`)
              }
            } else if (dg['algorithm'] === 'sha512') {
              if (dg['encoding'] !== 'sri-base64') d.push(`sha512 digest must have encoding: 'sri-base64'`)
              else if (typeof dg['value'] !== 'string' || !SRI_BASE64.test(dg['value'] as string)) {
                d.push(`sha512 digest value must match sha512-<base64>`)
              }
            }
          }
        }
      }
    }

    // Validate npmInstallManifests — collect semanticHashes
    const npmManifestHashes = new Set<string>()
    const manifests = p['npmInstallManifests']
    if (Array.isArray(manifests)) {
      for (const m of manifests) {
        if (typeof m === 'object' && m !== null) {
          const mObj = m as Record<string, unknown>
          if (typeof mObj['semanticHash'] === 'string') {
            npmManifestHashes.add(mObj['semanticHash'] as string)
          }
        }
      }
    }

    // Validate actions
    const actionIds = new Set<string>()
    const actions = p['authorizedActions']
    if (Array.isArray(actions)) {
      for (const act of actions) {
        if (typeof act !== 'object' || act === null) continue
        const a = act as Record<string, unknown>
        const kind = a['kind'] as string
        const actionId = a['actionId'] as string

        if (!VALID_ACTION_KINDS.has(kind)) {
          d.push(`unknown action kind: ${JSON.stringify(kind)}`)
        }

        if (typeof actionId === 'string') {
          if (actionIds.has(actionId)) {
            d.push(`duplicate actionId: ${actionId}`)
          } else {
            actionIds.add(actionId)
          }
        } else {
          d.push(`action is missing actionId (kind: ${JSON.stringify(kind)})`)
        }

        const mp = a['mutationPolicy'] as Record<string, unknown> | undefined

        // apply-configuration-template invariants
        if (kind === 'apply-configuration-template') {
          const tmpl = a['template'] as Record<string, unknown> | undefined
          const writePolicy = tmpl?.['writePolicy']
          if (writePolicy === 'validate-only') {
            if (mp?.['mutating'] !== false) {
              d.push(`apply-configuration-template with writePolicy 'validate-only' must have mutationPolicy.mutating: false`)
            }
          } else if (writePolicy === 'create-if-absent' || writePolicy === 'replace-authorized-generated-file') {
            if (mp?.['mutating'] !== true) {
              d.push(`apply-configuration-template with writePolicy '${writePolicy}' must have mutationPolicy.mutating: true`)
            }
          }
        }

        // validate-provider invariant
        if (kind === 'validate-provider') {
          if (mp?.['mutating'] !== false) {
            d.push(`validate-provider must have mutationPolicy.mutating: false`)
          }
        }

        // install-language-package: check manifest hash exists
        if (kind === 'install-language-package') {
          const npmManifestHash = a['npmManifestHash'] as string | undefined
          if (typeof npmManifestHash !== 'string' || !npmManifestHashes.has(npmManifestHash)) {
            d.push(`install-language-package action '${actionId}' has no matching npmInstallManifest (npmManifestHash: ${JSON.stringify(npmManifestHash)})`)
          }
        }

        // fetch-artifact: check artifactAuthorizationId exists in verifiedArtifacts
        if (kind === 'fetch-artifact') {
          const artifactAuthorizationId = a['artifactAuthorizationId'] as string | undefined
          if (typeof artifactAuthorizationId !== 'string' || !artifactAuthIds.has(artifactAuthorizationId)) {
            d.push(`fetch-artifact action '${actionId}' has no matching verifiedArtifact (artifactAuthorizationId: ${JSON.stringify(artifactAuthorizationId)})`)
          }
        }
      }
    }

    if (d.length > 0) {
      throw new PlanStructureError(d, `Plan structure validation failed: ${d.length} error(s)`)
    }
    return input as AuthorizedCapabilityResolutionPlan
  }
}
