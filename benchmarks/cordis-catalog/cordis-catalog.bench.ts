/** Required cold-load and complete-query budgets for generated Cordis catalogs. */

import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runBuiltBenchmarkWorker } from '../support/built-worker.ts'
import { ciTimeBudget } from '../support/calibration.ts'

interface CatalogLoadReport {
  readonly specifier: string
  readonly loadMs: number
  readonly retainedHeapBytes: number
  readonly exports: number
}

interface HostCatalogQueryReport {
  readonly iterations: number
  readonly services: number
  readonly events: number
  readonly operations: number
  readonly outputBytes: number
  readonly totalMs: number
  readonly perSweepMs: number
}

interface ClientCatalogQueryReport extends HostCatalogQueryReport {
  readonly slots: number
}

const ATTEMPTS = 5
const QUERY_ITERATIONS = 3
const WORKER_TIMEOUT_MS = 120_000
const MIB = 1024 * 1024
const MAX_LOAD_HEAP_BYTES = 8 * MIB
const EXPECTED_HOST_LOAD_MS = 30
const EXPECTED_QUERY_MS = { host: 420, client: 8 }
const LOAD_WORKER = join(import.meta.dirname, '..', '.dsh-build', 'cordis-catalog', 'catalog-load.worker.js')
const HOST_QUERY_WORKER = join(import.meta.dirname, '..', '.dsh-build', 'cordis-catalog', 'host-query.worker.js')
const CLIENT_QUERY_WORKER = join(import.meta.dirname, '..', '.dsh-build', 'cordis-catalog', 'client-query.worker.js')
const ROOT = join(import.meta.dirname, '..', '..')

function median(values: readonly number[]): number {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)] as number
}

async function sample<Report>(worker: string, args: readonly string[]): Promise<Report> {
  const outcome = await runBuiltBenchmarkWorker<Report>({
    worker,
    args,
    timeoutMs: WORKER_TIMEOUT_MS,
    exposeGc: true,
  })
  if (outcome.timedOut || outcome.signal !== null || outcome.exitCode !== 0 || outcome.report === undefined) {
    throw new Error(`Cordis catalog worker failed: ${JSON.stringify(outcome)}`)
  }
  return outcome.report
}

describe('generated Cordis catalog runtime', () => {
  it('loads the shipped Host entry in a fresh process', async () => {
    const samples: CatalogLoadReport[] = []
    const specifier = '@deepseek-ai/dsh-tool-cordis'
    const entryUrl = pathToFileURL(join(ROOT, 'packages/extensions/tool-cordis/lib/index.js')).href
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      samples.push(await sample<CatalogLoadReport>(LOAD_WORKER, [specifier, entryUrl]))
    }
    const medianMs = median(samples.map(row => row.loadMs))
    const budgetMs = ciTimeBudget(EXPECTED_HOST_LOAD_MS)
    console.log(JSON.stringify({ benchmark: 'cordis-catalog/host-load', samples, medianMs, budgetMs }))
    expect(samples.every(row => row.exports > 0)).toBe(true)
    expect(medianMs).toBeLessThanOrEqual(budgetMs)
    expect(Math.max(...samples.map(row => row.retainedHeapBytes))).toBeLessThanOrEqual(MAX_LOAD_HEAP_BYTES)
  })

  it.each([
    ['host', HOST_QUERY_WORKER],
    ['client', CLIENT_QUERY_WORKER],
  ] as const)('serializes every %s catalog query within budget', async (face, worker) => {
    const samples: Array<HostCatalogQueryReport | ClientCatalogQueryReport> = []
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      samples.push(await sample(worker, [String(QUERY_ITERATIONS)]))
    }
    const medianMs = median(samples.map(row => row.perSweepMs))
    const budgetMs = ciTimeBudget(EXPECTED_QUERY_MS[face])
    console.log(JSON.stringify({ benchmark: `cordis-catalog/${face}-query`, samples, medianMs, budgetMs }))
    expect(samples.every(row => row.operations > 0 && row.outputBytes > 0)).toBe(true)
    expect(medianMs).toBeLessThanOrEqual(budgetMs)
  })
})
