import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { DigestComputer } from '../digest-computer.js'
import type { ArtifactByteReader, InertArtifactHandle } from '@rohinik-org/package-trust-ir'

// ─── Fake reader ─────────────────────────────────────────────────────────────

function makeReader(chunks: Uint8Array[], failAfterChunks?: number): ArtifactByteReader & { streamCalls: number; disposeCalls: number } {
  return {
    streamCalls: 0,
    disposeCalls: 0,
    async *streamArtifact(_handle: InertArtifactHandle): AsyncIterable<Uint8Array> {
      this.streamCalls++
      let yielded = 0
      for (const chunk of chunks) {
        if (failAfterChunks !== undefined && yielded >= failAfterChunks) {
          throw new Error('simulated read error')
        }
        yield chunk
        yielded++
      }
    },
    async dispose(_handle: InertArtifactHandle): Promise<void> {
      this.disposeCalls++
    },
  }
}

const FAKE_HANDLE = {} as InertArtifactHandle
const INPUT = new TextEncoder().encode('hello world')

describe('DigestComputer', () => {
  const computer = new DigestComputer()

  it('SHA-256 hex known vector', async () => {
    const reader = makeReader([INPUT])
    const result = await computer.compute(FAKE_HANDLE, reader, 'sha256', 'hex')
    expect(result.computed).toBe(true)
    if (result.computed) {
      expect(result.digest.algorithm).toBe('sha256')
      expect(result.digest.encoding).toBe('hex')
      expect(result.digest.value).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
    }
  })

  it('SHA-512 hex known vector', async () => {
    const reader = makeReader([INPUT])
    const result = await computer.compute(FAKE_HANDLE, reader, 'sha512', 'hex')
    expect(result.computed).toBe(true)
    if (result.computed) {
      expect(result.digest.value).toBe('309ecc489c12d6eb4cc40f50c902f2b4d0ed77ee511a7c7a9bcd3ca86d4cd86f989dd35bc5ff499670da34255b45b0cfd830e81f605dcf7dc5542e93ae9cd76f')
    }
  })

  it('SHA-256 SRI Base64 known vector', async () => {
    const reader = makeReader([INPUT])
    const result = await computer.compute(FAKE_HANDLE, reader, 'sha256', 'sri-base64')
    expect(result.computed).toBe(true)
    if (result.computed) {
      expect(result.digest.value).toBe('sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek=')
    }
  })

  it('SHA-512 SRI Base64 known vector', async () => {
    const reader = makeReader([INPUT])
    const result = await computer.compute(FAKE_HANDLE, reader, 'sha512', 'sri-base64')
    expect(result.computed).toBe(true)
    if (result.computed) {
      expect(result.digest.value).toBe('sha512-MJ7MSJwS1utMxA9QyQLytNDtd+5RGnx6m808qG1M2G+YndNbxf9JlnDaNCVbRbDP2DDoH2Bdz33FVC6TrpzXbw==')
    }
  })

  it('empty artifact', async () => {
    const reader = makeReader([new Uint8Array(0)])
    const result = await computer.compute(FAKE_HANDLE, reader, 'sha256', 'hex')
    expect(result.computed).toBe(true)
    if (result.computed) {
      expect(result.digest.value).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    }
  })

  it('multi-chunk stream — same result as single chunk', async () => {
    const chunks = [INPUT.slice(0, 5), INPUT.slice(5)]
    const single = makeReader([INPUT])
    const multi = makeReader(chunks)
    const r1 = await computer.compute(FAKE_HANDLE, single, 'sha256', 'hex')
    const r2 = await computer.compute(FAKE_HANDLE, multi, 'sha256', 'hex')
    expect(r1.computed && r2.computed && r1.digest.value === r2.digest.value).toBe(true)
  })

  it('one-byte chunks', async () => {
    const oneByteChunks = Array.from(INPUT).map(b => new Uint8Array([b]))
    const reader = makeReader(oneByteChunks)
    const result = await computer.compute(FAKE_HANDLE, reader, 'sha256', 'hex')
    expect(result.computed).toBe(true)
    if (result.computed) {
      expect(result.digest.value).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
    }
  })

  it('large synthetic stream — incremental processing', async () => {
    const chunkSize = 64 * 1024
    const numChunks = 16
    const chunks: Uint8Array[] = Array.from({ length: numChunks }, () => {
      const c = new Uint8Array(chunkSize)
      c.fill(0xab)
      return c
    })

    const combined = Buffer.alloc(chunkSize * numChunks, 0xab)
    const expected = createHash('sha256').update(combined).digest('hex')

    const reader = makeReader(chunks)
    const result = await computer.compute(FAKE_HANDLE, reader, 'sha256', 'hex')
    expect(result.computed).toBe(true)
    if (result.computed) {
      expect(result.digest.value).toBe(expected)
    }
  })

  it('byte order preserved', async () => {
    const ordered = new Uint8Array([0x01, 0x02, 0x03, 0x04])
    const reversed = new Uint8Array([0x04, 0x03, 0x02, 0x01])
    const r1 = await computer.compute(FAKE_HANDLE, makeReader([ordered]), 'sha256', 'hex')
    const r2 = await computer.compute(FAKE_HANDLE, makeReader([reversed]), 'sha256', 'hex')
    expect(r1.computed && r2.computed && r1.digest.value !== r2.digest.value).toBe(true)
  })

  it('stream error converted to artifact-read-failed', async () => {
    const reader = makeReader([INPUT], 0)
    const result = await computer.compute(FAKE_HANDLE, reader, 'sha256', 'hex')
    expect(result.computed).toBe(false)
    if (!result.computed) {
      expect(result.reason).toBe('artifact-read-failed')
    }
  })
})
