/** Threshold-free Host-orchestrated browser diagnostic for cold materialization of the shipped Client Cordis catalog entry. */

import type {
  ClientBundleRegistration, ClientModuleLoaderTarget, WebBootGraph,
} from '@deepseek-ai/dsh-client-modules/client'
import type {} from '@deepseek-ai/dsh-cordis-host-runner'
import { chromium, type Browser, type Page } from 'playwright'
import { expect, it } from 'vitest'
import { launchWebScaffold, type WebScaffold } from '../../apps/web/tests/scaffold.ts'
import { newEnglishPage } from '../../apps/web/tests/support.ts'

interface ClientLoadProbe {
  registrations: number
  factoryCalls: number
  exportsApply: boolean
  registrationAt?: number
  factoryStartAt?: number
  factoryEndAt?: number
}

interface ClientLoadObservation {
  readonly graphRows: number
  readonly batches: number
  readonly batchPhase: string
  readonly batchEntries: number
  readonly registrations: number
  readonly factoryCalls: number
  readonly exportsApply: boolean
  readonly resourceEntries: number
  readonly resourceStartAt: number
  readonly responseEndAt: number
  readonly registrationAt: number
  readonly factoryStartAt: number
  readonly factoryEndAt: number
  readonly transferBytes: number
  readonly encodedBodyBytes: number
  readonly decodedBodyBytes: number
}

interface ClientLoadReport {
  readonly browserVersion: string
  readonly transportToRegistrationMs: number
  readonly coldMaterializedMs: number
  readonly factoryMs: number
  readonly batchEntries: number
  readonly transferBytes: number
  readonly encodedBodyBytes: number
  readonly decodedBodyBytes: number
  readonly clientProviders: readonly string[]
}

const SAMPLES = 5
const RUNNER_ID = '@deepseek-ai/dsh-cordis-client-runner'
const EXPECTED_CLIENT_PROVIDERS = ['Builtin', 'Event', 'Service', 'Slots', 'Theme'] as const
const SAMPLE_TIMEOUT_MS = 120_000

function median(values: readonly number[]): number {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)] as number
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100
}

async function installLoadProbe(page: Page): Promise<void> {
  await page.addInitScript(({ runnerId }) => {
    const probe: ClientLoadProbe = {
      registrations: 0,
      factoryCalls: 0,
      exportsApply: false,
    }
    Reflect.set(globalThis, '__dshCordisCatalogLoadProbe', probe)

    const instrument = (target: ClientModuleLoaderTarget): void => {
      let delegate = target.load
      const load = (registration: ClientBundleRegistration): void => {
        if (registration.id !== runnerId || registration.chunk !== undefined) {
          delegate.call(target, registration)
          return
        }
        probe.registrations += 1
        probe.registrationAt ??= performance.now()
        delegate.call(target, {
          ...registration,
          factory(require) {
            probe.factoryCalls += 1
            probe.factoryStartAt ??= performance.now()
            try {
              const exports = registration.factory(require)
              probe.exportsApply = typeof exports.apply === 'function'
              return exports
            } finally {
              probe.factoryEndAt = performance.now()
            }
          },
        })
      }
      Object.defineProperty(target, 'load', {
        configurable: true,
        enumerable: true,
        get: () => load,
        set: (next: ClientModuleLoaderTarget['load']) => { delegate = next },
      })
    }

    Object.defineProperty(globalThis, '__ModuleLoader__', {
      configurable: true,
      set(target: ClientModuleLoaderTarget) {
        Object.defineProperty(globalThis, '__ModuleLoader__', {
          configurable: true,
          writable: true,
          value: target,
        })
        instrument(target)
      },
    })
  }, { runnerId: RUNNER_ID })
}

async function readObservation(page: Page): Promise<ClientLoadObservation> {
  return await page.evaluate((runnerId): ClientLoadObservation => {
    const graph = Reflect.get(globalThis, '__DSH_BOOT__') as WebBootGraph | undefined
    const probe = Reflect.get(globalThis, '__dshCordisCatalogLoadProbe') as ClientLoadProbe | undefined
    if (graph === undefined || probe === undefined) throw new Error('Cordis catalog load probe did not observe Client boot')

    const rows = graph.entries.filter(row => row.id === runnerId)
    const batches = graph.batches.filter(batch => batch.entries.includes(runnerId))
    const batch = batches[0]
    if (batch === undefined) throw new Error(`Client boot graph has no batch for ${runnerId}`)
    const resourceUrl = new URL(batch.url, location.href).href
    const resources = performance.getEntriesByName(resourceUrl)
      .filter((entry): entry is PerformanceResourceTiming => 'decodedBodySize' in entry)
      .sort((left, right) => left.startTime - right.startTime)
    const resource = resources[0]
    if (resource === undefined) throw new Error(`No resource timing entry for ${resourceUrl}`)

    const required = (value: number | undefined, label: string): number => {
      if (value === undefined) throw new Error(`Cordis catalog load probe did not record ${label}`)
      return value
    }
    return {
      graphRows: rows.length,
      batches: batches.length,
      batchPhase: batch.phase,
      batchEntries: batch.entries.length,
      registrations: probe.registrations,
      factoryCalls: probe.factoryCalls,
      exportsApply: probe.exportsApply,
      resourceEntries: resources.length,
      resourceStartAt: resource.startTime,
      responseEndAt: resource.responseEnd,
      registrationAt: required(probe.registrationAt, 'registration'),
      factoryStartAt: required(probe.factoryStartAt, 'factory start'),
      factoryEndAt: required(probe.factoryEndAt, 'factory end'),
      transferBytes: resource.transferSize,
      encodedBodyBytes: resource.encodedBodySize,
      decodedBodyBytes: resource.decodedBodySize,
    }
  }, RUNNER_ID)
}

async function sampleClientLoad(): Promise<ClientLoadReport> {
  let scaffold: WebScaffold | undefined
  let browser: Browser | undefined
  let report: ClientLoadReport | undefined
  let runFailed = false
  let runFailure: unknown
  try {
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch({ headless: true, timeout: SAMPLE_TIMEOUT_MS })
    const page = await newEnglishPage(browser)
    page.setDefaultTimeout(SAMPLE_TIMEOUT_MS)
    const consoleFailures: string[] = []
    const pageErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') {
        consoleFailures.push(`${message.type()}: ${message.text()}`)
      }
    })
    page.on('pageerror', error => pageErrors.push(String(error)))
    await installLoadProbe(page)

    const navigation = await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    expect(navigation?.status()).toBe(200)
    await page.getByRole('tree', { name: 'Sessions' }).waitFor({ state: 'visible' })
    await expect.poll(() => scaffold?.ctx.cordisInspect.list()
      .filter(provider => provider.platform === 'client')
      .map(provider => provider.id)
      .sort(), { timeout: SAMPLE_TIMEOUT_MS }).toEqual([...EXPECTED_CLIENT_PROVIDERS])

    const clientProviders = scaffold.ctx.cordisInspect.list()
      .filter(provider => provider.platform === 'client')
      .map(provider => provider.id)
      .sort()
    const observation = await readObservation(page)
    expect(observation.graphRows).toBe(1)
    expect(observation.batches).toBe(1)
    expect(observation.batchPhase).toBe('application')
    expect(observation.batchEntries).toBeGreaterThan(0)
    expect(observation.registrations).toBe(1)
    expect(observation.factoryCalls).toBe(1)
    expect(observation.exportsApply).toBe(true)
    expect(observation.resourceEntries).toBeGreaterThan(0)
    expect(observation.responseEndAt).toBeGreaterThan(observation.resourceStartAt)
    expect(observation.registrationAt).toBeGreaterThanOrEqual(observation.responseEndAt)
    expect(observation.factoryStartAt).toBeGreaterThanOrEqual(observation.registrationAt)
    expect(observation.factoryEndAt).toBeGreaterThanOrEqual(observation.factoryStartAt)
    expect(observation.decodedBodyBytes).toBeGreaterThan(0)
    expect(consoleFailures).toEqual([])
    expect(pageErrors).toEqual([])

    report = {
      browserVersion: browser.version(),
      transportToRegistrationMs: roundMs(observation.registrationAt - observation.resourceStartAt),
      coldMaterializedMs: roundMs(observation.factoryEndAt - observation.resourceStartAt),
      factoryMs: roundMs(observation.factoryEndAt - observation.factoryStartAt),
      batchEntries: observation.batchEntries,
      transferBytes: observation.transferBytes,
      encodedBodyBytes: observation.encodedBodyBytes,
      decodedBodyBytes: observation.decodedBodyBytes,
      clientProviders,
    }
  } catch (error) {
    runFailed = true
    runFailure = error
  } finally {
    const failures: unknown[] = runFailed ? [runFailure] : []
    if (browser !== undefined) {
      try {
        await browser.close()
      } catch (error) {
        failures.push(error)
      }
    }
    if (scaffold !== undefined) {
      try {
        await scaffold.close()
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'Client catalog sample and cleanup failed')
  }
  if (report === undefined) throw new Error('Client catalog sample completed without a report')
  return report
}

it('reports shipped Client Cordis catalog cold materialization without a timing verdict', async () => {
  const samples: ClientLoadReport[] = []
  for (let attempt = 0; attempt < SAMPLES; attempt += 1) {
    samples.push(await sampleClientLoad())
  }
  console.log(JSON.stringify({
    benchmark: 'cordis-catalog/client-load-diagnostic',
    samples,
    medians: {
      transportToRegistrationMs: median(samples.map(sample => sample.transportToRegistrationMs)),
      coldMaterializedMs: median(samples.map(sample => sample.coldMaterializedMs)),
      factoryMs: median(samples.map(sample => sample.factoryMs)),
    },
    verdict: 'diagnostic-only',
  }))
})
