import type { PackageQuarantinePolicy, QuarantineMode } from './types.js'

// Preference order: stronger containment first
const MODE_PREFERENCE: readonly QuarantineMode[] = ['isolate', 'copy-and-seal', 'seal', 'deny-activation', 'manual-containment']

export function resolveQuarantineMode(policy: PackageQuarantinePolicy): QuarantineMode {
  const available = policy.allowedModes
  if (available.length === 0) {
    throw new Error('No quarantine modes available in policy')
  }

  for (const preferred of MODE_PREFERENCE) {
    if (!available.includes(preferred)) continue
    if (preferred === 'manual-containment' && !policy.allowManualContainment) continue
    // Check if selected mode is weaker than defaultMode
    const defaultIdx = MODE_PREFERENCE.indexOf(policy.defaultMode)
    const selectedIdx = MODE_PREFERENCE.indexOf(preferred)
    if (selectedIdx > defaultIdx) {
      // Selected is weaker — only allowed if degraded or copy fallback permitted
      if (!policy.allowCopyFallback && !policy.allowDegradedContainment) {
        throw new Error(`Mode ${preferred} is weaker than defaultMode ${policy.defaultMode} and fallback is not allowed`)
      }
    }
    return preferred
  }

  throw new Error(`No suitable quarantine mode found in allowedModes: [${available.join(', ')}]`)
}
