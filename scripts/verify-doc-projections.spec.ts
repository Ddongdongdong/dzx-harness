import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { staleGeneratedOutputs } from './verify-doc-projections.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('shared documentation projection verification', () => {
  it('reports stale and missing outputs in input order', () => {
    const root = mkdtempSync(join(tmpdir(), 'doc-projections-'))
    roots.push(root)
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(join(root, 'docs/current.md'), 'current\n')
    writeFileSync(join(root, 'docs/stale.md'), 'before\n')

    expect(staleGeneratedOutputs(root, [
      ['docs/current.md', 'current\n'],
      ['docs/stale.md', 'after\n'],
      ['docs/missing.md', 'missing\n'],
    ])).toEqual(['docs/stale.md', 'docs/missing.md'])
  })
})
