/** Enforce deterministic raw-byte budgets for selected shipped JavaScript bundles. */

import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

/** Built entrypoints whose raw representation is budgeted. */
export const BUILT_BUNDLE_FILES = {
  hostBundleBytes: 'packages/extensions/tool-cordis/lib/index.js',
  clientBundleBytes: 'packages/extensions/cordis-client-runner/lib/client.js',
} as const

/** Reviewed raw-byte ceilings for the built bundle lane. */
export const BUILT_ENGINEERING_BUDGETS = {
  hostBundleBytes: 540_000,
  clientBundleBytes: 262_000,
  aggregateBundleBytes: 800_000,
} as const

/** Exact raw-byte measurements for the selected built entrypoints. */
export interface BuiltEngineeringBudgetMeasurements {
  readonly hostBundleBytes: number
  readonly clientBundleBytes: number
  readonly aggregateBundleBytes: number
}

/** One built budget result suitable for CLI and test diagnostics. */
export interface BuiltEngineeringBudgetResult {
  readonly metric: keyof BuiltEngineeringBudgetMeasurements
  readonly actual: number
  readonly ceiling: number
  readonly passed: boolean
}

/**
 * Measure selected JavaScript entrypoints after the repository build.
 * @param root - Repository root containing the built package trees.
 * @returns Exact raw-byte counts for both entrypoints and their aggregate.
 */
export function measureBuiltEngineeringBudgets(root: string): BuiltEngineeringBudgetMeasurements {
  const entries = Object.entries(BUILT_BUNDLE_FILES) as [
    keyof typeof BUILT_BUNDLE_FILES,
    string,
  ][]
  const measured = entries.map(([metric, path]) => {
    const absolute = resolve(root, path)
    if (!existsSync(absolute)) throw new Error(`budgeted built bundle is missing: ${path}`)
    return [metric, statSync(absolute).size] as const
  })
  const sizes = Object.fromEntries(measured) as Pick<
    BuiltEngineeringBudgetMeasurements,
    keyof typeof BUILT_BUNDLE_FILES
  >
  return {
    ...sizes,
    aggregateBundleBytes: sizes.hostBundleBytes + sizes.clientBundleBytes,
  }
}

/**
 * Compare exact built measurements with reviewed raw-byte ceilings.
 * @param measurements - Values produced from a completed repository build.
 * @returns One ordered result per built budget.
 */
export function evaluateBuiltEngineeringBudgets(
  measurements: BuiltEngineeringBudgetMeasurements,
): BuiltEngineeringBudgetResult[] {
  return (Object.keys(BUILT_ENGINEERING_BUDGETS) as (keyof BuiltEngineeringBudgetMeasurements)[])
    .map(metric => ({
      metric,
      actual: measurements[metric],
      ceiling: BUILT_ENGINEERING_BUDGETS[metric],
      passed: measurements[metric] <= BUILT_ENGINEERING_BUDGETS[metric],
    }))
}

/**
 * Render the complete built budget report.
 * @param results - Ordered built engineering budget results.
 * @returns Human-readable rows with a trailing newline.
 */
export function renderBuiltEngineeringBudgetReport(
  results: readonly BuiltEngineeringBudgetResult[],
): string {
  const rows = results.map((result) => {
    const utilization = (result.actual / result.ceiling * 100).toFixed(1)
    return `${result.passed ? 'ok  ' : 'OVER'} ${result.metric}: ${String(result.actual)} / ${String(result.ceiling)} (${utilization}%)`
  })
  return `${rows.join('\n')}\n`
}

function main(): void {
  const root = resolve(import.meta.dirname, '..')
  const results = evaluateBuiltEngineeringBudgets(measureBuiltEngineeringBudgets(root))
  process.stdout.write(renderBuiltEngineeringBudgetReport(results))
  if (results.some(result => !result.passed)) process.exitCode = 1
}

if (import.meta.main) main()
