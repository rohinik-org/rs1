import { describe, it, expect } from 'vitest'
import { EnglishTokenizer } from '../tokenizer.js'

describe('EnglishTokenizer', () => {
  const t = new EnglishTokenizer()

  it('splits on whitespace', () => {
    expect(t.tokenize('sort me now').map(x => x.value)).toEqual(['sort', 'me', 'now'])
  })

  it('splits on punctuation', () => {
    expect(t.tokenize('sort.').map(x => x.value)).toEqual(['sort'])
    expect(t.tokenize('sort!').map(x => x.value)).toEqual(['sort'])
    expect(t.tokenize('sort?').map(x => x.value)).toEqual(['sort'])
    expect(t.tokenize('sort,').map(x => x.value)).toEqual(['sort'])
    expect(t.tokenize('add-me').map(x => x.value)).toEqual(['add', 'me'])
  })

  it('is case-insensitive (lowercases everything)', () => {
    expect(t.tokenize('SORT These').map(x => x.value)).toEqual(['sort', 'these'])
  })

  it('does not split within a word (summarize stays whole)', () => {
    expect(t.tokenize('summarize').map(x => x.value)).toEqual(['summarize'])
    expect(t.tokenize('sorting').map(x => x.value)).toEqual(['sorting'])
    expect(t.tokenize('addition').map(x => x.value)).toEqual(['addition'])
  })

  it('empty input yields empty token list', () => {
    expect(t.tokenize('')).toEqual([])
  })

  it('collapses consecutive delimiters', () => {
    expect(t.tokenize('a   b\t\tc').map(x => x.value)).toEqual(['a', 'b', 'c'])
  })
})
