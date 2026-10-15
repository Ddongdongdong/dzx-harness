import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CORDIS_CATALOG_FILES,
  ENGINEERING_BUDGETS,
  evaluateEngineeringBudgets,
  measureEngineeringBudgets,
  renderEngineeringBudgetReport,
} from './verify-engineering-budgets.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(contents: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'engineering-budgets-'))
  roots.push(root)
  CORDIS_CATALOG_FILES.forEach((path, index) => {
    const destination = join(root, path)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, contents[index] ?? '')
  })
  return root
}

describe('engineering budgets', () => {
  it('measures exact bytes and logical lines across the catalog set', () => {
    const root = fixture(['one\ntwo\n', 'three', ''])

    expect(measureEngineeringBudgets(root, 17)).toEqual({
      cordisCatalogBytes: 13,
      cordisCatalogLines: 3,
      docSyncLeafGates: 17,
    })
  })

  it('rejects every ceiling independently and renders attributable diagnostics', () => {
    const results = evaluateEngineeringBudgets({
      cordisCatalogBytes: ENGINEERING_BUDGETS.cordisCatalogBytes + 1,
      cordisCatalogLines: ENGINEERING_BUDGETS.cordisCatalogLines + 1,
      docSyncLeafGates: ENGINEERING_BUDGETS.docSyncLeafGates + 1,
    })

    expect(results.every(result => !result.passed)).toBe(true)
    expect(renderEngineeringBudgetReport(results)).toContain(
      `OVER cordisCatalogBytes: ${String(ENGINEERING_BUDGETS.cordisCatalogBytes + 1)} / ${String(ENGINEERING_BUDGETS.cordisCatalogBytes)}`,
    )
  })

  it('accepts exact ceilings', () => {
    const measurements = { ...ENGINEERING_BUDGETS }

    expect(evaluateEngineeringBudgets(measurements).every(result => result.passed)).toBe(true)
  })

  it('rejects a missing catalog instead of measuring a partial set', () => {
    const root = fixture(['one\n', 'two\n', 'three\n'])
    rmSync(join(root, CORDIS_CATALOG_FILES[1]))

    expect(() => measureEngineeringBudgets(root, 1)).toThrow(
      `budgeted catalog is missing: ${CORDIS_CATALOG_FILES[1]}`,
    )
  })
})
