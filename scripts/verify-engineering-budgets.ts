/** Enforce deterministic size and gate-inventory budgets for engineering control surfaces. */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gatesForMode } from './run-gates.ts'

/** Generated catalogs whose aggregate representation is budgeted. */
export const CORDIS_CATALOG_FILES = [
  'packages/extensions/tool-cordis/src/api-catalog.ts',
  'packages/extensions/cordis-client-runner/src/client/api-catalog.ts',
  'packages/extensions/cordis-client-runner/src/client/slot-catalog.ts',
] as const

/** Reviewed deterministic ceilings; timing budgets require separate runner calibration. */
export const ENGINEERING_BUDGETS = {
  cordisCatalogBytes: 745_000,
  cordisCatalogLines: 10_850,
  docSyncLeafGates: 43,
} as const

/** Measured values for the deterministic engineering budgets. */
export interface EngineeringBudgetMeasurements {
  readonly cordisCatalogBytes: number
  readonly cordisCatalogLines: number
  readonly docSyncLeafGates: number
}

/** One budget result suitable for CLI and test diagnostics. */
export interface EngineeringBudgetResult {
  readonly metric: keyof EngineeringBudgetMeasurements
  readonly actual: number
  readonly ceiling: number
  readonly passed: boolean
}

function lineCount(content: string): number {
  if (content.length === 0) return 0
  const newlines = content.match(/\n/gu)?.length ?? 0
  return content.endsWith('\n') ? newlines : newlines + 1
}

/**
 * Measure generated catalogs and the documentation aggregate inventory.
 * @param root - Repository root containing every budgeted catalog.
 * @param docSyncLeafGates - Current number of leaves in the `doc-sync` aggregate.
 * @returns Exact byte, line, and gate counts.
 */
export function measureEngineeringBudgets(
  root: string,
  docSyncLeafGates: number,
): EngineeringBudgetMeasurements {
  let cordisCatalogBytes = 0
  let cordisCatalogLines = 0
  for (const path of CORDIS_CATALOG_FILES) {
    const absolute = resolve(root, path)
    if (!existsSync(absolute)) throw new Error(`budgeted catalog is missing: ${path}`)
    const content = readFileSync(absolute)
    cordisCatalogBytes += content.byteLength
    cordisCatalogLines += lineCount(content.toString('utf8'))
  }
  return { cordisCatalogBytes, cordisCatalogLines, docSyncLeafGates }
}

/**
 * Compare exact measurements with reviewed source ceilings.
 * @param measurements - Values produced by the deterministic measurement.
 * @returns One ordered result per budget.
 */
export function evaluateEngineeringBudgets(
  measurements: EngineeringBudgetMeasurements,
): EngineeringBudgetResult[] {
  return (Object.keys(ENGINEERING_BUDGETS) as (keyof EngineeringBudgetMeasurements)[])
    .map(metric => ({
      metric,
      actual: measurements[metric],
      ceiling: ENGINEERING_BUDGETS[metric],
      passed: measurements[metric] <= ENGINEERING_BUDGETS[metric],
    }))
}

/**
 * Render the complete budget report.
 * @param results - Ordered engineering budget results.
 * @returns Human-readable rows with a trailing newline.
 */
export function renderEngineeringBudgetReport(results: readonly EngineeringBudgetResult[]): string {
  const rows = results.map((result) => {
    const utilization = (result.actual / result.ceiling * 100).toFixed(1)
    return `${result.passed ? 'ok  ' : 'OVER'} ${result.metric}: ${String(result.actual)} / ${String(result.ceiling)} (${utilization}%)`
  })
  return `${rows.join('\n')}\n`
}

function main(): void {
  const root = resolve(import.meta.dirname, '..')
  const measurements = measureEngineeringBudgets(root, gatesForMode('doc-sync').length)
  const results = evaluateEngineeringBudgets(measurements)
  process.stdout.write(renderEngineeringBudgetReport(results))
  if (results.some(result => !result.passed)) process.exitCode = 1
}

if (import.meta.main) main()
