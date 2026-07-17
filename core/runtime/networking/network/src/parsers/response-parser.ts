export interface ResponseParser<T = unknown> {
  parse(body: string): T
}

export class JsonParser implements ResponseParser {
  parse(body: string): unknown { return JSON.parse(body) }
}

export class HtmlParser implements ResponseParser<string> {
  parse(body: string): string { return body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() }
}

export class MarkdownParser implements ResponseParser<string> {
  parse(body: string): string { return body }
}
