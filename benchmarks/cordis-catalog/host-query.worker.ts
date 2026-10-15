/** Compiled Host Provider query workload over the generated Cordis catalogs. */

import { performance } from 'node:perf_hooks'
import {
  EVENT_API,
  queryEventApi,
  queryServiceApi,
  SERVICE_API,
} from '../../packages/extensions/tool-cordis/src/api-catalog.ts'
import { assertBuiltBenchmarkRuntime } from '../support/built-worker.ts'

interface HostCatalogQueryReport {
  readonly iterations: number
  readonly services: number
  readonly events: number
  readonly operations: number
  readonly outputBytes: number
  readonly totalMs: number
  readonly perSweepMs: number
}

const iterations = positiveInteger(process.argv[2], 'iterations')
let outputBytes = 0
const started = performance.now()
for (let iteration = 0; iteration < iterations; iteration += 1) {
  outputBytes += JSON.stringify(queryServiceApi()).length
  for (const entry of SERVICE_API) {
    outputBytes += JSON.stringify(queryServiceApi(entry.key)).length
  }
  outputBytes += JSON.stringify(queryEventApi()).length
  for (const entry of EVENT_API) {
    outputBytes += JSON.stringify(queryEventApi(entry.name)).length
  }
}
const totalMs = performance.now() - started
const operations = iterations * (SERVICE_API.length + EVENT_API.length + 2)
const report: HostCatalogQueryReport = {
  iterations,
  services: SERVICE_API.length,
  events: EVENT_API.length,
  operations,
  outputBytes,
  totalMs: Math.round(totalMs * 100) / 100,
  perSweepMs: Math.round(totalMs / iterations * 100) / 100,
}

assertBuiltBenchmarkRuntime(import.meta.url, {})
process.stdout.write(`${JSON.stringify(report)}\n`)

function positiveInteger(value: string | undefined, label: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`)
  return parsed
}
