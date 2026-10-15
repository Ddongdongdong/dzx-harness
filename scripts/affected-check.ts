/** Recommend local checks from an explicit Git change scope and workspace dependency graph. */

import { existsSync, globSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { collectChangeScope } from './change-scope.ts'

const FORMAT_VERSION = 1
const PACKAGE_PREFIX = '@deepseek-ai/dsh-'

/** One package and the in-repository runtime dependencies that can propagate a change. */
export interface AffectedPackageNode {
  readonly name: string
  readonly rel: string
  readonly dependencies: readonly string[]
}

/** One command recommendation with reviewable reasons. */
export interface CheckRecommendation {
  readonly command: string
  readonly reasons: readonly string[]
}

/** Dependency impact for one directly changed package. */
export interface PackageImpact {
  readonly package: string
  readonly directConsumers: readonly string[]
  readonly transitiveConsumers: readonly string[]
}

/** Complete advisory result for a set of changed repository paths. */
export interface AffectedCheckReport {
  readonly formatVersion: typeof FORMAT_VERSION
  readonly advisoryOnly: true
  readonly paths: readonly string[]
  readonly packageImpacts: readonly PackageImpact[]
  readonly recommendations: readonly CheckRecommendation[]
  readonly unmappedPaths: readonly string[]
}

interface PackageManifest {
  readonly name?: string
  readonly dependencies?: Readonly<Record<string, string>>
  readonly optionalDependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
}

function repositoryPath(path: string): string {
  return path.split(sep).join('/')
}

/**
 * Discover package dependency edges that affect runtime and shared-instance consumers.
 * @param root - Repository root containing `packages/<group>/<package>` manifests.
 * @returns Package nodes sorted by repository path.
 */
export function collectAffectedPackageGraph(root: string): AffectedPackageNode[] {
  const manifests = globSync('packages/*/*/package.json', { cwd: root })
    .map(repositoryPath)
    .sort()
    .map(path => ({
      path,
      manifest: JSON.parse(readFileSync(resolve(root, path), 'utf8')) as PackageManifest,
    }))
  const names = new Set(manifests.map(({ manifest }) => manifest.name).filter((name): name is string => (
    name?.startsWith(PACKAGE_PREFIX) === true
  )))
  return manifests.flatMap(({ path, manifest }) => {
    if (manifest.name === undefined || !names.has(manifest.name)) return []
    const dependencyNames = new Set<string>()
    for (const dependencies of [
      manifest.dependencies,
      manifest.optionalDependencies,
      manifest.peerDependencies,
    ]) {
      for (const name of Object.keys(dependencies ?? {})) {
        if (names.has(name)) dependencyNames.add(name)
      }
    }
    return [{
      name: manifest.name,
      rel: path.slice(0, -'/package.json'.length),
      dependencies: [...dependencyNames].sort(),
    }]
  })
}

function quotePath(path: string): string {
  return `'${path.replaceAll("'", "'\\''")}'`
}

function packageForPath(path: string, packages: readonly AffectedPackageNode[]): AffectedPackageNode | undefined {
  return packages.find(pkg => path === pkg.rel || path.startsWith(`${pkg.rel}/`))
}

function consumersOf(
  packageName: string,
  reverse: ReadonlyMap<string, readonly string[]>,
): { direct: string[]; transitive: string[] } {
  const direct = [...(reverse.get(packageName) ?? [])].sort()
  const seen = new Set(direct)
  const queue = [...direct]
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) break
    for (const consumer of reverse.get(current) ?? []) {
      if (seen.has(consumer)) continue
      seen.add(consumer)
      queue.push(consumer)
    }
  }
  return { direct, transitive: [...seen].sort() }
}

/**
 * Derive package impact and conservative command suggestions from changed paths.
 * @param root - Repository root used to locate owner-local script tests.
 * @param changedPaths - Repository-relative committed and worktree paths.
 * @param packages - Workspace runtime dependency graph.
 * @returns Deterministic advisory report; commands are never executed.
 */
export function recommendAffectedChecks(
  root: string,
  changedPaths: readonly string[],
  packages: readonly AffectedPackageNode[],
): AffectedCheckReport {
  const paths = [...new Set(changedPaths.map(repositoryPath))].sort()
  const reverse = new Map<string, string[]>()
  for (const pkg of packages) {
    for (const dependency of pkg.dependencies) {
      const consumers = reverse.get(dependency) ?? []
      consumers.push(pkg.name)
      reverse.set(dependency, consumers)
    }
  }

  const changedPackages = new Map<string, AffectedPackageNode>()
  const mapped = new Set<string>()
  const recommendations = new Map<string, Set<string>>()
  const add = (command: string, reason: string): void => {
    const reasons = recommendations.get(command) ?? new Set<string>()
    reasons.add(reason)
    recommendations.set(command, reasons)
  }

  const sourcePaths: string[] = []
  const testPaths: string[] = []
  let clientSourceChanged = false
  for (const path of paths) {
    const pkg = packageForPath(path, packages)
    if (pkg !== undefined) {
      mapped.add(path)
      changedPackages.set(pkg.name, pkg)
      if (/\/src\/.*\.[cm]?[jt]sx?$/u.test(path)) {
        sourcePaths.push(path)
        clientSourceChanged ||= path.startsWith('packages/client/')
      }
      if (/\/tests\/.*\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(path)) testPaths.push(path)
      if (path.endsWith('/package.json') || /\/tsconfig(?:\.[^/]+)?\.json$/u.test(path)) {
        add('pnpm run build', `${pkg.name} package or compiler metadata changed`)
        add('pnpm run hygiene', `${pkg.name} published package metadata or declarations may change`)
      }
      if (/(?:^|\/)README(?:\.zh)?\.md$/iu.test(path)) add('pnpm run doc-sync', `${pkg.name} documentation changed`)
    }
    if (path.startsWith('docs/') || path.startsWith('.agents/notes/') || /(?:^|\/)README(?:\.zh)?\.md$/iu.test(path) || path.endsWith('.i18n.yaml')) {
      mapped.add(path)
      add('pnpm run doc-sync', 'documentation or Agent Note changed')
    }
    if (path.startsWith('benchmarks/')) {
      mapped.add(path)
      add('pnpm run test:bench', 'required benchmark source or workload changed')
    }
    if (path.startsWith('scripts/')) {
      mapped.add(path)
      const isSpec = /\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(path)
      const spec = path.replace(/\.ts$/u, '.spec.ts')
      if (isSpec) {
        add(`pnpm exec vitest run ${quotePath(path)}`, 'script test file changed')
      } else if (spec !== path && existsSync(resolve(root, spec))) {
        add(`pnpm exec vitest run ${quotePath(spec)}`, `${path} has an owner-local spec`)
      } else {
        add('pnpm run lint', `${path} has no same-name owner-local spec`)
      }
    }
    if (path === 'package.json' || path === 'pnpm-lock.yaml' || path === 'pnpm-workspace.yaml') {
      mapped.add(path)
      add('pnpm run build', 'root dependency or workspace metadata changed')
      add('pnpm run hygiene', 'root dependency or workspace metadata changed')
    }
  }
  if (sourcePaths.length > 0) {
    add(
      `pnpm exec vitest related ${sourcePaths.map(quotePath).join(' ')} --run`,
      'package source changed; inspect the selected tests because dynamic and configuration consumers are not discoverable',
    )
    add('pnpm run typecheck', 'package source changed')
  }
  if (testPaths.length > 0) {
    add(`pnpm exec vitest run ${testPaths.map(quotePath).join(' ')}`, 'owner-local test files changed')
  }
  if (clientSourceChanged) add('pnpm run test:gui', 'Client source changed outside the default Host-focused test selection')

  const packageImpacts = [...changedPackages.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((pkg) => {
      const consumers = consumersOf(pkg.name, reverse)
      return {
        package: pkg.name,
        directConsumers: consumers.direct,
        transitiveConsumers: consumers.transitive,
      }
    })
  return {
    formatVersion: FORMAT_VERSION,
    advisoryOnly: true,
    paths,
    packageImpacts,
    recommendations: [...recommendations]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([command, reasons]) => ({ command, reasons: [...reasons].sort() })),
    unmappedPaths: paths.filter(path => !mapped.has(path)),
  }
}

/**
 * Render a human-readable advisory report.
 * @param report - Affected-check result to present.
 * @returns Text report with a trailing newline.
 */
export function renderAffectedCheckReport(report: AffectedCheckReport): string {
  const lines = [
    'Affected checks (advisory only; CI remains authoritative)',
    `Changed paths: ${String(report.paths.length)}`,
    '',
    'Package impact:',
  ]
  if (report.packageImpacts.length === 0) lines.push('- none')
  for (const impact of report.packageImpacts) {
    lines.push(`- ${impact.package}: ${String(impact.directConsumers.length)} direct, ${String(impact.transitiveConsumers.length)} transitive consumer(s)`)
  }
  lines.push('', 'Suggested commands:')
  if (report.recommendations.length === 0) lines.push('- none; select checks manually')
  for (const recommendation of report.recommendations) {
    lines.push(`- ${recommendation.command}`)
    for (const reason of recommendation.reasons) lines.push(`  reason: ${reason}`)
  }
  if (report.unmappedPaths.length > 0) {
    lines.push('', 'Paths requiring manual selection:')
    for (const path of report.unmappedPaths) lines.push(`- ${path}`)
  }
  return `${lines.join('\n')}\n`
}

function main(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: false,
    options: {
      base: { type: 'string' },
      head: { type: 'string', default: 'HEAD' },
      json: { type: 'boolean', default: false },
    },
    strict: true,
  })
  if (values.base === undefined) throw new Error('missing required --base <ref>')
  const scope = collectChangeScope({ base: values.base, head: values.head }, process.cwd())
  const changedPaths = Object.values(scope.paths).flat()
  const graph = collectAffectedPackageGraph(scope.repositoryRoot)
  const report = recommendAffectedChecks(scope.repositoryRoot, changedPaths, graph)
  process.stdout.write(values.json
    ? `${JSON.stringify(report, null, 2)}\n`
    : renderAffectedCheckReport(report))
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`affected-check: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
