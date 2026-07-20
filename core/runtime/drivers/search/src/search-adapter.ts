export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export interface HttpSearchClient {
  get(url: string): Promise<string>
}

export interface HtmlParser {
  parseSearchResults(html: string): SearchResult[]
  parsePageText(html: string): string
}
