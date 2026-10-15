/** Pure parsing and diff models consumed by the Trajectory inspector. */

import { structuredPatch } from 'diff'

/** One rendered line in a system-prompt or tool-catalog diff. */
export interface PromptDiffLine {
  kind: 'meta' | 'context' | 'added' | 'removed'
  text: string
}

/** Validated model-facing tool schema fields used by the inspector. */
export interface ParsedToolSchema {
  name: string
  description: string
  parameters: object
}

/**
 * Derive display lines for a prompt diff with three context lines.
 * @param before - Previous prompt or serialized tool catalog.
 * @param after - Current prompt or serialized tool catalog.
 * @returns Classified unified-diff lines without no-newline markers.
 */
export function promptDiffLines(before: string, after: string): readonly PromptDiffLine[] {
  const patch = structuredPatch('', '', before, after, undefined, undefined, { context: 3 })
  return patch.hunks.flatMap((hunk, hunkIndex) => [
    ...(hunkIndex === 0 ? [] : [{ kind: 'meta' as const, text: '' }]),
    {
      kind: 'meta' as const,
      text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    },
    ...hunk.lines.flatMap((line): PromptDiffLine[] => {
      if (line.startsWith('\\')) return []
      if (line.startsWith('+')) return [{ kind: 'added', text: line }]
      if (line.startsWith('-')) return [{ kind: 'removed', text: line }]
      return [{ kind: 'context', text: line }]
    }),
  ])
}

/**
 * Parse the tool schema fields rendered by the structured inspector.
 * @param value - Recorded JSON schema text.
 * @returns Validated fields, or undefined for malformed and incomplete schemas.
 */
export function parseToolSchema(value: string): ParsedToolSchema | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const schema = parsed as Record<string, unknown>
    if (
      typeof schema.name !== 'string'
      || typeof schema.description !== 'string'
      || typeof schema.parameters !== 'object'
      || schema.parameters === null
      || Array.isArray(schema.parameters)
    ) return undefined
    return {
      name: schema.name,
      description: schema.description,
      parameters: schema.parameters,
    }
  } catch {
    return undefined
  }
}

/**
 * Parse JSON containers rendered as trees while leaving scalars as text.
 * @param value - Recorded JSON text.
 * @returns A non-null object or array, or undefined for malformed JSON and scalars.
 */
export function parseJsonContainer(value: string): object | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined
  } catch {
    return undefined
  }
}
