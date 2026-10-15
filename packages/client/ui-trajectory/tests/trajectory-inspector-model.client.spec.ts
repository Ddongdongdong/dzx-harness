import { describe, expect, it } from 'vitest'
import {
  parseJsonContainer, parseToolSchema, promptDiffLines,
} from '../src/client/trajectory-inspector-model.ts'

describe('trajectory inspector model', () => {
  it('classifies unified prompt diff lines and omits no-newline markers', () => {
    const lines = promptDiffLines('alpha\nbeta', 'alpha\ngamma')
    expect(lines.map(line => line.kind)).toEqual(['meta', 'context', 'removed', 'added'])
    expect(lines.map(line => line.text)).toEqual([
      '@@ -1,2 +1,2 @@',
      ' alpha',
      '-beta',
      '+gamma',
    ])
  })

  it('parses JSON objects and arrays but leaves scalars and malformed input as text', () => {
    expect(parseJsonContainer('{"ok":true}')).toEqual({ ok: true })
    expect(parseJsonContainer('[1,2]')).toEqual([1, 2])
    expect(parseJsonContainer('42')).toBeUndefined()
    expect(parseJsonContainer('{')).toBeUndefined()
  })

  it('accepts only complete object-based tool schemas', () => {
    expect(parseToolSchema(JSON.stringify({
      name: 'read',
      description: 'Read a file.',
      parameters: { type: 'object' },
    }))).toEqual({
      name: 'read',
      description: 'Read a file.',
      parameters: { type: 'object' },
    })
    expect(parseToolSchema('{"name":"read"}')).toBeUndefined()
    expect(parseToolSchema('{"name":"read","description":"Read","parameters":[]}')).toBeUndefined()
  })
})
