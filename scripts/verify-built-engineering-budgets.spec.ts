import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BUILT_BUNDLE_FILES,
  BUILT_ENGINEERING_BUDGETS,
  evaluateBuiltEngineeringBudgets,
  measureBuiltEngineeringBudgets,
  renderBuiltEngineeringBudgetReport,
} from './verify-built-engineering-budgets.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(hostBytes: number, clientBytes: number): string {
  const root = mkdtempSync(join(tmpdir(), 'built-engineering-budgets-'))
  roots.push(root)
  for (const [metric, path] of Object.entries(BUILT_BUNDLE_FILES)) {
    const destination = join(root, path)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, 'x'.repeat(metric === 'hostBundleBytes' ? hostBytes : clientBytes))
  }
  return root
}

describe('built engineering budgets', () => {
  it('measures exact raw bytes for both entrypoints and their aggregate', () => {
    expect(measureBuiltEngineeringBudgets(fixture(13, 17))).toEqual({
      hostBundleBytes: 13,
      clientBundleBytes: 17,
      aggregateBundleBytes: 30,
    })
  })

  it.each(Object.keys(BUILT_ENGINEERING_BUDGETS) as (keyof typeof BUILT_ENGINEERING_BUDGETS)[])(
    'rejects the %s ceiling independently',
    (metric) => {
      const measurements = { ...BUILT_ENGINEERING_BUDGETS, [metric]: BUILT_ENGINEERING_BUDGETS[metric] + 1 }
      const results = evaluateBuiltEngineeringBudgets(measurements)

      expect(results.find(result => result.metric === metric)?.passed).toBe(false)
      expect(results.filter(result => result.metric !== metric).every(result => result.passed)).toBe(true)
      expect(renderBuiltEngineeringBudgetReport(results)).toContain(
        `OVER ${metric}: ${String(BUILT_ENGINEERING_BUDGETS[metric] + 1)} / ${String(BUILT_ENGINEERING_BUDGETS[metric])}`,
      )
    },
  )

  it('accepts exact ceilings', () => {
    expect(evaluateBuiltEngineeringBudgets(BUILT_ENGINEERING_BUDGETS).every(result => result.passed))
      .toBe(true)
  })

  it('rejects a missing built entrypoint instead of measuring a partial set', () => {
    const root = fixture(1, 1)
    rmSync(join(root, BUILT_BUNDLE_FILES.clientBundleBytes))

    expect(() => measureBuiltEngineeringBudgets(root)).toThrow(
      `budgeted built bundle is missing: ${BUILT_BUNDLE_FILES.clientBundleBytes}`,
    )
  })
})
