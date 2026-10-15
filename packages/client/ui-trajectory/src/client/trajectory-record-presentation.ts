/** Pure text presentation helpers shared by the Trajectory ledger and inspector. */

import { codeProgram, PTC_TOOL_NAME } from './code-program.ts'
import type { TrajectoryTranslate } from './locales.ts'
import { trajectoryPreviewText } from './trajectory-preview.ts'
import type { TrajectoryCellProps } from './trajectory-record.ts'

/** Parsed row text for a tool or program call. */
export interface ToolCallTextParts {
  program: boolean
  name: string
  args?: string
}

/**
 * Test whether an Assistant record contains only tool calls.
 * @param cell - Projected trajectory record.
 * @param t - Trajectory locale translator used by the projection placeholder.
 * @returns Whether the record has no thinking or answer content.
 */
export function isToolCallOnly(cell: TrajectoryCellProps, t: TrajectoryTranslate): boolean {
  return cell.kind === 'message'
    && !cell.outputDetail
    && !cell.thinkingDetail
    && cell.text === t('layout.toolCallOnly')
}

/**
 * Derive the complete single-line text shown for a ledger record.
 * @param cell - Projected trajectory record.
 * @param t - Trajectory locale translator.
 * @returns Plain row text with Markdown reduced to a preview.
 */
export function recordDisplayText(cell: TrajectoryCellProps, t: TrajectoryTranslate): string {
  if (isToolCallOnly(cell, t)) return ''
  const program = codeProgram(cell)
  if (program !== undefined) return `${PTC_TOOL_NAME} · ${program.description.replace(/\s+/g, ' ')}`
  if (cell.previewMarkdown !== undefined) {
    const preview = trajectoryPreviewText(cell.previewMarkdown)
    if (cell.text === '') return preview
    return preview === '' ? cell.text : `${cell.text} · ${preview}`
  }
  if (cell.text !== '') return cell.text
  const markdown = cell.kind === 'user' || cell.kind === 'context'
    ? cell.inputDetail
    : cell.kind === 'message'
      ? cell.outputDetail ?? cell.thinkingDetail
      : undefined
  return markdown === undefined ? '' : trajectoryPreviewText(markdown)
}

/**
 * Derive the plain result text shown beside a tool call.
 * @param cell - Projected trajectory record.
 * @returns Recorded result text with Markdown reduced to a preview.
 */
export function recordResultText(cell: TrajectoryCellProps): string | undefined {
  return cell.resultPreviewMarkdown === undefined
    ? cell.result
    : trajectoryPreviewText(cell.resultPreviewMarkdown)
}

/**
 * Split a tool row into its name and argument summary.
 * @param cell - Projected trajectory record.
 * @param text - Complete display text derived for the record.
 * @returns Tool-call parts, or undefined for a non-tool record.
 */
export function toolCallTextParts(
  cell: TrajectoryCellProps,
  text: string,
): ToolCallTextParts | undefined {
  if (cell.kind !== 'tool' && cell.kind !== 'subtool') return undefined
  const program = cell.toolName === PTC_TOOL_NAME
  const separator = text.indexOf(' · ')
  if (separator === -1) return { name: text, program }
  return {
    program,
    name: text.slice(0, separator),
    args: text.slice(separator + 3),
  }
}
