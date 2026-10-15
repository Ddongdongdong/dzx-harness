/** Compiled Client Provider query workload over API and Slot catalogs. */

import { performance } from 'node:perf_hooks'
import type { Context } from '@deepseek-ai/cordis'
import { EVENT_API, SERVICE_API } from '../../packages/extensions/cordis-client-runner/src/client/api-catalog.ts'
import { clientInspectProviders } from '../../packages/extensions/cordis-client-runner/src/client/providers.ts'
import { CLIENT_SLOT_API } from '../../packages/extensions/cordis-client-runner/src/client/slot-catalog.ts'
import { assertBuiltBenchmarkRuntime } from '../support/built-worker.ts'

interface ClientCatalogQueryReport {
  readonly iterations: number
  readonly services: number
  readonly events: number
  readonly slots: number
  readonly operations: number
  readonly outputBytes: number
  readonly totalMs: number
  readonly perSweepMs: number
}

const iterations = positiveInteger(process.argv[2], 'iterations')
const slotNodes = CLIENT_SLOT_API.map(entry => ({
  type: 'slot' as const,
  name: entry.key,
  kind: entry.kind,
  scope: entry.scope,
  declaredBy: 'benchmark',
  occupants: [],
  children: [],
}))
const slots = {
  snapshot(root?: string) {
    if (root === undefined) return slotNodes
    const selected = slotNodes.find(node => node.name === root)
    return selected === undefined ? [] : [selected]
  },
}
const providers = clientInspectProviders({
  get(name: string) { return name === 'slots' ? slots : undefined },
} as unknown as Context)
const service = providers.find(provider => provider.manifest.id === 'Service')
const event = providers.find(provider => provider.manifest.id === 'Event')
const slot = providers.find(provider => provider.manifest.id === 'Slots')
if (service === undefined || event === undefined || slot === undefined) {
  throw new Error('Client catalog providers are incomplete')
}

let outputBytes = 0
const started = performance.now()
for (let iteration = 0; iteration < iterations; iteration += 1) {
  outputBytes += JSON.stringify(await service.query('listService', undefined, {} as never)).length
  for (const entry of SERVICE_API) {
    outputBytes += JSON.stringify(await service.query(
      'listService', { service: entry.key }, {} as never,
    )).length
  }
  outputBytes += JSON.stringify(await event.query('listEvents', undefined, {} as never)).length
  for (const entry of EVENT_API) {
    outputBytes += JSON.stringify(await event.query(
      'listEvents', { event: entry.name }, {} as never,
    )).length
  }
  outputBytes += JSON.stringify(await slot.query('listSubTree', undefined, {} as never)).length
  for (const entry of CLIENT_SLOT_API) {
    outputBytes += JSON.stringify(await slot.query(
      'listSubTree', { root: entry.key }, {} as never,
    )).length
  }
}
const totalMs = performance.now() - started
const operations = iterations * (SERVICE_API.length + EVENT_API.length + CLIENT_SLOT_API.length + 3)
const report: ClientCatalogQueryReport = {
  iterations,
  services: SERVICE_API.length,
  events: EVENT_API.length,
  slots: CLIENT_SLOT_API.length,
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
