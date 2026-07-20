import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import type {
  ExecutionDriver,
  DriverDescriptor,
  DriverHealth,
  DriverRequest,
  DriverRawEvent,
} from '@rohinik-org/capability-manifest'
import { DriverErrorCode, makeDriverError, RUNTIME_API_VERSION } from '@rohinik-org/capability-manifest'

export const DOCUMENT_CAPABILITY_IDS = [
  'document:parse',
  'document:parse-pdf',
  'document:parse-docx',
  'document:parse-structured',
  'document:parse-csv',
] as const

const DESCRIPTOR: DriverDescriptor = {
  id: 'document',
  version: '0.1.0',
  apiVersion: RUNTIME_API_VERSION,
  priority: 10,
  tags: ['document', 'parser', 'local'],
  capabilities: {
    supportsStreaming: false,
    supportsCancellation: false,
    supportsProgress: false,
    supportsHealth: true,
    offline: true,
    sandboxed: false,
    trusted: true,
  },
}

// StructuredTextDriver handles: .md .csv .json .yaml .yml .toml .xml .ini .txt — zero extra deps
async function parseStructured(content: string, ext: string): Promise<unknown> {
  switch (ext) {
    case '.json': return JSON.parse(content)
    case '.csv': {
      const lines = content.split('\n').filter(Boolean)
      const headers = lines[0]?.split(',').map(h => h.trim()) ?? []
      return lines.slice(1).map(l => {
        const vals = l.split(',').map(v => v.trim())
        return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
      })
    }
    case '.md':
    case '.txt':
    default:
      return content
  }
}

async function parsePdf(buffer: Buffer): Promise<string> {
  try {
    // ponytail: pdf-parse is optional — dynamic import avoids build-time type errors
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = (await import('pdf-parse' as any)).default as (buf: Buffer) => Promise<{ text: string }>
    const result = await pdfParse(buffer)
    return result.text
  } catch {
    throw new Error('pdf-parse not available — install it to enable PDF parsing')
  }
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const mammoth = (await import('mammoth')).default
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

export class DocumentDriver implements ExecutionDriver {
  readonly descriptor = DESCRIPTOR

  async *execute(request: DriverRequest): AsyncIterable<DriverRawEvent> {
    const { capabilityId, input } = request
    const inp = input as Record<string, string>

    yield { type: 'STARTED', payload: {} }

    try {
      switch (capabilityId) {
        case 'document:parse': {
          const filePath = inp.path!
          const ext = extname(filePath).toLowerCase()
          const buf = await readFile(filePath)

          if (ext === '.pdf') {
            yield { type: 'RESULT', payload: await parsePdf(buf) }
          } else if (ext === '.docx') {
            yield { type: 'RESULT', payload: await parseDocx(buf) }
          } else {
            yield { type: 'RESULT', payload: await parseStructured(buf.toString('utf8'), ext) }
          }
          break
        }

        case 'document:parse-pdf': {
          const buf = await readFile(inp.path!)
          yield { type: 'RESULT', payload: await parsePdf(buf) }
          break
        }

        case 'document:parse-docx': {
          const buf = await readFile(inp.path!)
          yield { type: 'RESULT', payload: await parseDocx(buf) }
          break
        }

        case 'document:parse-structured': {
          const buf = await readFile(inp.path!)
          const ext = extname(inp.path!).toLowerCase()
          yield { type: 'RESULT', payload: await parseStructured(buf.toString('utf8'), ext) }
          break
        }

        case 'document:parse-csv': {
          const buf = await readFile(inp.path!)
          yield { type: 'RESULT', payload: await parseStructured(buf.toString('utf8'), '.csv') }
          break
        }

        default: {
          const ext = inp.path ? extname(inp.path).toLowerCase() : ''
          if (!ext || !SUPPORTED_EXTS.has(ext)) {
            yield { type: 'ERROR', payload: makeDriverError(DriverErrorCode.UNSUPPORTED_FORMAT, `Unsupported format: "${ext || capabilityId}"`) }
            return
          }
          yield { type: 'ERROR', payload: makeDriverError(DriverErrorCode.CAPABILITY_NOT_FOUND, `Unknown capability: ${capabilityId}`) }
          return
        }
      }
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('Unsupported') || msg.includes('unsupported') || msg.includes('UNSUPPORTED')) {
        yield { type: 'ERROR', payload: makeDriverError(DriverErrorCode.UNSUPPORTED_FORMAT, msg) }
      } else {
        yield { type: 'ERROR', payload: makeDriverError(DriverErrorCode.EXECUTION_FAILED, msg, { cause: err }) }
      }
      return
    }

    yield { type: 'COMPLETE', payload: {} }
  }

  async health(): Promise<DriverHealth> {
    return { status: 'healthy', checkedAt: new Date() }
  }

  async shutdown(): Promise<void> {}
}

const SUPPORTED_EXTS = new Set(['.md', '.txt', '.csv', '.json', '.yaml', '.yml', '.toml', '.xml', '.ini', '.pdf', '.docx'])
