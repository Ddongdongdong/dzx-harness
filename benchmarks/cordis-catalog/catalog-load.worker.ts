/** Fresh-process loader for shipped Cordis catalog-bearing package entries. */

import { performance } from 'node:perf_hooks'
import { assertBuiltBenchmarkRuntime } from '../support/built-worker.ts'

const [specifier, entryUrl] = process.argv.slice(2)
if (specifier === undefined || entryUrl === undefined || !entryUrl.startsWith('file:')) {
  throw new Error('catalog load worker requires a label and built package file URL')
}

global.gc?.()
const heapBefore = process.memoryUsage().heapUsed
const started = performance.now()
const namespace = await import(entryUrl)
const loadMs = performance.now() - started
global.gc?.()

assertBuiltBenchmarkRuntime(import.meta.url, { [specifier]: entryUrl })
process.stdout.write(`${JSON.stringify({
  specifier,
  loadMs: Math.round(loadMs * 100) / 100,
  retainedHeapBytes: process.memoryUsage().heapUsed - heapBefore,
  exports: Object.keys(namespace).length,
})}\n`)
