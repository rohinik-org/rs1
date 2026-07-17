import type { CommandResolution } from '../../types/command-ir.js'

const KNOWN_TOOLS = new Set([
  'python', 'node', 'git', 'docker', 'java', 'go', 'rust', 'dotnet',
  'ollama', 'vscode', 'gh', 'powershell', 'kubectl', 'terraform', 'ffmpeg',
])

export class PackageManagerResolver {
  resolve(target: string): CommandResolution | null {
    if (!KNOWN_TOOLS.has(target.toLowerCase())) return null
    return { source: 'package-manager', resolvedId: target, explanation: `"${target}" is a known installable tool (via platform package manager)` }
  }
}
