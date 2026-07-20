import type { HttpSearchClient, HtmlParser, SearchResult } from './search-adapter.js'

const DDG_SEARCH = 'https://html.duckduckgo.com/html/?q='

// ponytail: real HTTP client using node:https — injectable for tests
export class NodeHttpClient implements HttpSearchClient {
  async get(url: string): Promise<string> {
    const { default: https } = await import('node:https')
    const { default: http } = await import('node:http')
    const client = url.startsWith('https') ? https : http
    return new Promise((resolve, reject) => {
      const req = client.get(url, { headers: { 'User-Agent': 'Rohinik/0.1' } }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        res.on('error', reject)
      })
      req.on('error', reject)
      req.end()
    })
  }
}

// ponytail: minimal HTML parser — no external deps
export class DuckDuckGoHtmlParser implements HtmlParser {
  parseSearchResults(html: string): SearchResult[] {
    const results: SearchResult[] = []
    // Extract result blocks: <a class="result__a" href="...">title</a> and snippet
    const linkRe = /class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g
    const snippetRe = /class="result__snippet"[^>]*>([^<]+(?:<[^/][^>]*>[^<]*<\/[^>]+>)*[^<]*)<\/[^>]+>/g
    const titles: Array<{ url: string; title: string }> = []
    let m: RegExpExecArray | null
    while ((m = linkRe.exec(html)) !== null) {
      titles.push({ url: m[1]!, title: m[2]!.trim() })
    }
    const snippets: string[] = []
    while ((m = snippetRe.exec(html)) !== null) {
      snippets.push(m[1]!.replace(/<[^>]+>/g, '').trim())
    }
    for (let i = 0; i < titles.length; i++) {
      results.push({ title: titles[i]!.title, url: titles[i]!.url, snippet: snippets[i] ?? '' })
    }
    return results
  }

  parsePageText(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }
}

export class DuckDuckGoAdapter {
  constructor(
    private readonly http: HttpSearchClient = new NodeHttpClient(),
    private readonly parser: HtmlParser = new DuckDuckGoHtmlParser()
  ) {}

  async search(query: string): Promise<SearchResult[]> {
    const url = DDG_SEARCH + encodeURIComponent(query)
    const html = await this.http.get(url)
    return this.parser.parseSearchResults(html)
  }

  async fetchPage(url: string): Promise<string> {
    const html = await this.http.get(url)
    return this.parser.parsePageText(html)
  }
}
