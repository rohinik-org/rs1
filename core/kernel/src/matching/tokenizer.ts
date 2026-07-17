// Tokenizer — turns text into a normalized token stream for keyword matching.
//
// Rohinik is designed to be multilingual. English whitespace/punctuation rules
// are not universal. Injecting the tokenizer at the Matcher boundary lets
// future locales plug in without changing matcher code.

export interface Token {
  readonly value: string
}

export interface Tokenizer {
  tokenize(text: string): readonly Token[]
}

// Default: splits on non-word characters (ASCII punctuation, whitespace, symbols).
// Case-normalizes to lowercase. Filters empty tokens.
//
// Adequate for English intent hints today. Future locales should implement
// their own Tokenizer.
export class EnglishTokenizer implements Tokenizer {
  tokenize(text: string): readonly Token[] {
    if (text.length === 0) return []
    const raw = text.toLowerCase().split(/\W+/)
    const tokens: Token[] = []
    for (const t of raw) {
      if (t.length > 0) tokens.push({ value: t })
    }
    return tokens
  }
}

export const DEFAULT_TOKENIZER: Tokenizer = new EnglishTokenizer()
