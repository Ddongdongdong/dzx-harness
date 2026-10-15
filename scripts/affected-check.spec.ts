import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  collectAffectedPackageGraph,
  recommendAffectedChecks,
  renderAffectedCheckReport,
  type AffectedPackageNode,
} from './affected-check.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'affected-check-'))
  roots.push(root)
  return root
}

function write(root: string, path: string, value: unknown): void {
  const destination = join(root, path)
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, typeof value === 'string' ? value : `${JSON.stringify(value)}\n`)
}

const packages: AffectedPackageNode[] = [
  { name: '@deepseek-ai/dsh-session', rel: 'packages/core/session', dependencies: [] },
  { name: '@deepseek-ai/dsh-agent', rel: 'packages/core/agent', dependencies: ['@deepseek-ai/dsh-session'] },
  { name: '@deepseek-ai/dsh-app', rel: 'packages/client/app', dependencies: ['@deepseek-ai/dsh-agent'] },
]

describe('affected-check', () => {
  it('discovers runtime and peer edges but excludes development-only consumers', () => {
    const root = fixture()
    write(root, 'packages/core/session/package.json', { name: '@deepseek-ai/dsh-session' })
    write(root, 'packages/core/agent/package.json', {
      name: '@deepseek-ai/dsh-agent',
      dependencies: { '@deepseek-ai/dsh-session': 'workspace:^' },
    })
    write(root, 'packages/client/app/package.json', {
      name: '@deepseek-ai/dsh-app',
      peerDependencies: { '@deepseek-ai/dsh-agent': 'workspace:^' },
      devDependencies: { '@deepseek-ai/dsh-session': 'workspace:^' },
    })

    expect(collectAffectedPackageGraph(root)).toEqual([packages[2], packages[1], packages[0]])
  })

  it('reports direct and transitive consumers and recommends focused package checks', () => {
    const root = fixture()
    const report = recommendAffectedChecks(root, [
      'packages/core/session/src/index.ts',
      'packages/core/session/tests/session.spec.ts',
      'packages/core/session/README.md',
    ], packages)

    expect(report.packageImpacts).toEqual([{
      package: '@deepseek-ai/dsh-session',
      directConsumers: ['@deepseek-ai/dsh-agent'],
      transitiveConsumers: ['@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-app'],
    }])
    expect(report.recommendations).toEqual(expect.arrayContaining([
      { command: 'pnpm run doc-sync', reasons: ['@deepseek-ai/dsh-session documentation changed', 'documentation or Agent Note changed'] },
      { command: 'pnpm run typecheck', reasons: ['package source changed'] },
      {
        command: "pnpm exec vitest related 'packages/core/session/src/index.ts' --run",
        reasons: ['package source changed; inspect the selected tests because dynamic and configuration consumers are not discoverable'],
      },
      {
        command: "pnpm exec vitest run 'packages/core/session/tests/session.spec.ts'",
        reasons: ['owner-local test files changed'],
      },
    ]))
    expect(report.unmappedPaths).toEqual([])
  })

  it('covers script, benchmark, Client, and metadata changes without hiding unmapped paths', () => {
    const root = fixture()
    write(root, 'scripts/example.spec.ts', '')
    const report = recommendAffectedChecks(root, [
      'scripts/example.ts',
      'scripts/other.spec.ts',
      'benchmarks/session-open/session-open.bench.ts',
      'packages/client/app/src/index.tsx',
      'packages/client/app/package.json',
      'design/report.html',
    ], packages)

    expect(report.recommendations.map(item => item.command)).toEqual([
      "pnpm exec vitest related 'packages/client/app/src/index.tsx' --run",
      "pnpm exec vitest run 'scripts/example.spec.ts'",
      "pnpm exec vitest run 'scripts/other.spec.ts'",
      'pnpm run build',
      'pnpm run hygiene',
      'pnpm run test:bench',
      'pnpm run test:gui',
      'pnpm run typecheck',
    ])
    expect(report.unmappedPaths).toEqual(['design/report.html'])
    expect(renderAffectedCheckReport(report)).toContain('advisory only; CI remains authoritative')
    expect(renderAffectedCheckReport(report)).toContain('Paths requiring manual selection:\n- design/report.html')
  })

  it('returns an explicit manual-selection result for an empty recommendation set', () => {
    const report = recommendAffectedChecks(fixture(), ['unknown.bin'], packages)

    expect(report.recommendations).toEqual([])
    expect(report.unmappedPaths).toEqual(['unknown.bin'])
    expect(renderAffectedCheckReport(report)).toContain('- none; select checks manually')
  })
})
