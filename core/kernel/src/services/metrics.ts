import type { MetricsCollector } from '../domain/context.js'

interface HistogramEntry {
  sum: number
  count: number
  values: number[]
}

export class InMemoryMetricsCollector implements MetricsCollector {
  private counters = new Map<string, number>()
  private histograms = new Map<string, HistogramEntry>()

  increment(metric: string, _labels?: Record<string, string>): void {
    this.counters.set(metric, (this.counters.get(metric) ?? 0) + 1)
  }

  histogram(metric: string, value: number, _labels?: Record<string, string>): void {
    const existing = this.histograms.get(metric) ?? { sum: 0, count: 0, values: [] }
    existing.sum += value
    existing.count += 1
    existing.values.push(value)
    this.histograms.set(metric, existing)
  }

  getCounter(metric: string): number {
    return this.counters.get(metric) ?? 0
  }

  getHistogram(metric: string): HistogramEntry | undefined {
    return this.histograms.get(metric)
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters)
  }
}
