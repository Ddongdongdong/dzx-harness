/** Verify Host Cordis catalog and relationship-graph artifacts with one shared Typert projection. */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectCordisCatalog } from '@deepseek-ai/dsh-typert-generator'
import type { CordisCatalogModel } from '@deepseek-ai/dsh-typert-generator'
import { renderCordisCoreApiPages } from './cordis-core-api.ts'
import { computeOutputs, CORDIS_CATALOG_POLICY } from './gen-cordis-catalog.ts'
import { renderDocs } from './gen-doc-graphs.ts'

const root = resolve(import.meta.dirname, '..')

/**
 * Find generated outputs that differ from their committed files.
 * @param scanRoot - repository root containing the output paths.
 * @param outputs - repository-relative paths paired with expected content.
 * @returns stale or missing repository-relative paths in input order.
 */
export function staleGeneratedOutputs(
  scanRoot: string,
  outputs: Iterable<readonly [string, string]>,
): string[] {
  const stale: string[] = []
  for (const [path, content] of outputs) {
    const absolute = resolve(scanRoot, path)
    if (!existsSync(absolute) || readFileSync(absolute, 'utf8') !== content) stale.push(path)
  }
  return stale
}

interface SharedProjectionOutputs {
  readonly cordis: [string, string][]
  readonly model: CordisCatalogModel
}

/** Complete Cordis rendering before releasing the analyzer-backed projector. */
function projectCordisOutputs(): SharedProjectionOutputs {
  const projection = projectCordisCatalog(root, CORDIS_CATALOG_POLICY)
  return {
    cordis: computeOutputs(projection),
    model: projection.model,
  }
}

/** Verify both artifact families and report each owner's existing remediation command. */
function main(): void {
  const shared = projectCordisOutputs()
  const cordisOutputs: [string, string][] = [
    ...shared.cordis,
    ...renderCordisCoreApiPages(),
  ]
  const graphOutputs: [string, string][] = renderDocs(shared.model)
    .map(doc => [doc.rel, doc.content])
  const staleCordis = staleGeneratedOutputs(root, cordisOutputs)
  const staleGraphs = staleGeneratedOutputs(root, graphOutputs)

  if (staleCordis.length === 0) {
    console.log(`verify-doc-projections: ${cordisOutputs.length} Cordis artifact(s) are up to date.`)
  } else {
    console.error(
      `verify-doc-projections: stale Cordis artifact(s): ${staleCordis.join(', ')}. `
      + 'Run `pnpm run gen-cordis-catalog` and commit the result.',
    )
  }
  if (staleGraphs.length === 0) {
    console.log(`verify-doc-projections: ${graphOutputs.length} graph doc(s) are up to date.`)
  } else {
    console.error(
      `verify-doc-projections: stale graph doc(s): ${staleGraphs.join(', ')}. `
      + 'Run `pnpm run gen-doc-graphs` and commit the result.',
    )
  }
  if (staleCordis.length > 0 || staleGraphs.length > 0) process.exitCode = 1
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) main()
