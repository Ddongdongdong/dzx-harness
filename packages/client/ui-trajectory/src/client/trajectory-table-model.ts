/** Pure request-model helpers shared by the Trajectory ledger and inspector. */

import type { AssistantRequestConfig } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { COMPACTION_INTERRUPTED_ERROR } from './copy-codes.ts'
import type { TrajectoryTurnModel } from './layout.ts'
import type { TrajectoryTranslate } from './locales.ts'
import type { TrajectoryCellProps } from './trajectory-record.ts'
import { trajectoryRecordId } from './trajectory-record.ts'

/** One flattened ledger record with its section and folding metadata. */
export interface TableRecord {
  turn: number | null
  section: number
  group: string
  groupStart: boolean
  turnStart: boolean
  cell: TrajectoryCellProps
  turnEnd: boolean
  collapsedSummary?: string
  collapsedSummaryKind?: 'turn' | 'assistant'
}

/** Completion state shared by ledger rows and inspector panels. */
export type RecordState = 'complete' | 'running' | 'error'

/** Disjoint provider token buckets for one request or a session prefix. */
export interface TrajectoryUsage {
  input?: number
  cacheRead?: number
  cacheWrite?: number
  output?: number
  reasoning?: number
}

/** Request-inspector fields shared by ordinary generation and compaction. */
interface TrajectoryRequestNumberBase {
  group: string
  number: number
  status?: 'complete' | 'running' | 'error'
  startedAt?: number
  completedAt?: number | null
  error?: string
  errorCode?: string
  retry?: number
  maxRetries?: number
  retryDelayMs?: number
  resultSeq?: number
  provider?: string
  model?: string
  requestConfig?: AssistantRequestConfig
  usage?: TrajectoryUsage
  cumulativeUsage?: TrajectoryUsage
}

/** One purpose-discriminated request identity paired with its session-global number. */
export type TrajectoryRequestNumber = TrajectoryRequestNumberBase & (
  | {
    purpose?: 'assistant'
    /** Request anchor event sequence; absent for the currently streaming request. */
    seq?: number
    turn: number
    step: number
  }
  | {
    purpose: 'compaction'
    /** Request anchor event sequence and stable compaction identity. */
    seq: number
    turn: number | null
    step: 0
  }
)

/**
 * Build the display-group key used to join records with request metadata.
 * @param turn - Owning turn, or null for a between-turn section.
 * @param group - Display-group identifier within the turn.
 * @returns Key shared by records and their request metadata.
 */
export function requestKey(turn: number | null, group: string): string {
  return `${turn}\u0000${group}`
}

/**
 * Build the stable identity used by inspector selection state.
 * @param request - Assistant or compaction request metadata.
 * @returns Purpose-qualified identity, independent of display numbering.
 */
export function requestIdentity(request: TrajectoryRequestNumber): string {
  return request.purpose === 'compaction'
    ? `compaction\u0000${request.seq}`
    : `assistant\u0000${request.turn}\u0000${request.step}`
}

/**
 * Translate a turn number into the section label shown by the ledger.
 * @param turn - Owning turn, or null for a between-turn section.
 * @param t - Trajectory locale translator.
 * @returns Localized section label.
 */
export function sectionLabel(turn: number | null, t: TrajectoryTranslate): string {
  return turn === null ? t('section.betweenTurns') : t('turn.label', { turn })
}

/**
 * Index session-global request numbers by their display group.
 * @param sessionNumbers - Resident request metadata; absence produces an empty map.
 * @returns Group keys mapped to the last recorded number for each key.
 */
export function indexRequestNumbers(
  sessionNumbers: readonly TrajectoryRequestNumber[] | undefined,
): ReadonlyMap<string, number> {
  const numbers = new Map<string, number>()
  for (const request of sessionNumbers ?? []) {
    numbers.set(requestKey(request.turn, request.group), request.number)
  }
  return numbers
}

/**
 * Flatten grouped turns into the ledger's ordered record model.
 * @param turns - Ordered turn sections and their display groups.
 * @returns Fresh records with group and section flags, retaining cell identities.
 */
export function flattenRecords(turns: readonly TrajectoryTurnModel[]): TableRecord[] {
  return turns.flatMap((turn, section) => {
    let firstInSection = true
    const records = turn.groups.flatMap(group => group.cells.map((cell, index) => {
      const turnStart = firstInSection
        && cell.requestOnly !== true
        && cell.kind !== 'system'
        && (cell.kind !== 'compacted' || turn.turn === null)
      if (turnStart) firstInSection = false
      return {
        turn: turn.turn,
        section,
        group: group.title,
        groupStart: index === 0,
        turnStart,
        cell,
        turnEnd: false,
      }
    }))
    const last = records.at(-1)
    if (last !== undefined) last.turnEnd = true
    return records
  })
}

/**
 * Keep matching visible records and rebuild their section boundary flags.
 * @param records - Ordered ledger records.
 * @param matches - Matching cell indexes; request-only rows are excluded.
 * @returns Matching record copies with flags for the filtered order.
 */
export function filterRecords(
  records: readonly TableRecord[],
  matches: ReadonlySet<number>,
): TableRecord[] {
  const filtered = records
    .filter(record => record.cell.requestOnly !== true && matches.has(record.cell.index))
    .map(record => ({ ...record, groupStart: false, turnStart: false, turnEnd: false }))
  const startedSections = new Set<number>()
  for (const [index, record] of filtered.entries()) {
    const previous = filtered[index - 1]
    const next = filtered[index + 1]
    record.groupStart = previous === undefined
      || previous.section !== record.section
      || previous.group !== record.group
    record.turnStart = !startedSections.has(record.section)
      && record.cell.kind !== 'system'
      && (record.cell.kind !== 'compacted' || record.turn === null)
    if (record.turnStart) startedSections.add(record.section)
    record.turnEnd = next === undefined || next.section !== record.section
  }
  return filtered
}

/**
 * Locate the first content record for every numbered request group.
 * @param records - Ordered ledger records.
 * @param requestGroups - Display-group keys that have request metadata.
 * @returns First non-user, non-context cell index for each eligible group.
 */
export function indexRequestBoundaries(
  records: readonly TableRecord[],
  requestGroups: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  const boundaries = new Map<string, number>()
  for (const record of records) {
    const key = requestKey(record.turn, record.group)
    if (!requestGroups.has(key) || boundaries.has(key)) continue
    if (record.cell.kind === 'user' || record.cell.kind === 'context') continue
    boundaries.set(key, record.cell.index)
  }
  return boundaries
}

/**
 * Index adjacent request-only separators for virtual-row grouping.
 * @param records - Ordered ledger records.
 * @param requestGroups - Display-group keys that have request metadata.
 * @returns Cell indexes mapped to preceding separator counts within their run.
 */
export function indexRequestBoundaryRuns(
  records: readonly TableRecord[],
  requestGroups: ReadonlySet<string>,
): ReadonlyMap<number, number> {
  const indexes = new Map<number, number>()
  let runLength = 0
  for (const record of records) {
    if (record.cell.requestOnly === true) {
      indexes.set(record.cell.index, runLength++)
      continue
    }
    if (runLength > 0 && record.groupStart && requestGroups.has(requestKey(record.turn, record.group))) {
      indexes.set(record.cell.index, runLength)
    }
    runLength = 0
  }
  return indexes
}

function summarizeTurn(
  records: readonly TableRecord[],
  requestGroups: ReadonlySet<string>,
  t: TrajectoryTranslate,
): string {
  const steps = new Set(records
    .map(record => requestKey(record.turn, record.group))
    .filter(key => requestGroups.has(key))).size
  const toolCalls = records.filter(record =>
    record.cell.kind === 'tool' || record.cell.kind === 'subtool').length
  return [
    t(steps === 1 ? 'summary.steps.one' : 'summary.steps.other', { count: steps }),
    t(toolCalls === 1 ? 'summary.toolCalls.one' : 'summary.toolCalls.other', { count: toolCalls }),
  ].join(' · ')
}

/**
 * Replace folded turn contents with one localized summary record.
 * @param records - Ordered ledger records.
 * @param collapsedTurns - Turn numbers whose contents are folded.
 * @param requestGroups - Request keys used to count steps in each summary.
 * @param t - Trajectory locale translator.
 * @returns Records retaining the first content row, system rows, and request separators.
 */
export function collapseTurnRecords(
  records: readonly TableRecord[],
  collapsedTurns: ReadonlySet<number>,
  requestGroups: ReadonlySet<string>,
  t: TrajectoryTranslate,
): TableRecord[] {
  const recordsByTurn = new Map<number, TableRecord[]>()
  for (const record of records) {
    if (record.turn === null) continue
    const turnRecords = recordsByTurn.get(record.turn) ?? []
    turnRecords.push(record)
    recordsByTurn.set(record.turn, turnRecords)
  }
  return records.flatMap((record) => {
    if (record.turn === null || !collapsedTurns.has(record.turn)) return [record]
    const turnRecords = recordsByTurn.get(record.turn) ?? [record]
    if (record.cell.requestOnly === true || record.cell.kind === 'system') return [record]
    const contentRecords = turnRecords.filter(candidate =>
      candidate.cell.requestOnly !== true && candidate.cell.kind !== 'system')
    if (contentRecords.length <= 1) return [record]
    if (record.cell.index !== contentRecords[0]?.cell.index) return []
    return [
      { ...record, turnEnd: false },
      {
        ...record,
        groupStart: false,
        turnStart: false,
        turnEnd: true,
        collapsedSummary: summarizeTurn(contentRecords.slice(1), requestGroups, t),
        collapsedSummaryKind: 'turn' as const,
      },
    ]
  })
}

/**
 * Return consecutive Tool records owned by one Assistant record.
 * @param records - Ordered ledger records.
 * @param assistantIndex - Assistant cell index, not its position in the array.
 * @returns Consecutive tool and subtool records, or empty for a missing Assistant.
 */
export function assistantToolCalls(
  records: readonly TableRecord[],
  assistantIndex: number,
): readonly TableRecord[] {
  const at = records.findIndex(record => record.cell.index === assistantIndex)
  if (at === -1 || records[at]?.cell.kind !== 'message') return []
  const calls: TableRecord[] = []
  for (let index = at + 1; index < records.length; index++) {
    const record = records[index]
    if (record === undefined || (record.cell.kind !== 'tool' && record.cell.kind !== 'subtool')) break
    calls.push(record)
  }
  return calls
}

function summarizeAssistantTools(records: readonly TableRecord[], t: TrajectoryTranslate): string {
  const names = [...new Set(records.map((record) => {
    const separator = record.cell.text.indexOf(' · ')
    return separator === -1 ? record.cell.text : record.cell.text.slice(0, separator)
  }).filter(name => name !== ''))]
  const count = records.length
  const summary = t(count === 1 ? 'summary.toolCalls.one' : 'summary.toolCalls.other', { count })
  return names.length > 0 ? `${summary} · ${names.join(', ')}` : summary
}

/**
 * Replace folded Assistant tool calls with one localized summary record.
 * @param records - Ordered ledger records, potentially containing folded turns.
 * @param collapsedAssistants - Stable Assistant record identities to fold.
 * @param t - Trajectory locale translator.
 * @returns Records with eligible consecutive calls replaced by a summary.
 */
export function collapseAssistantRecords(
  records: readonly TableRecord[],
  collapsedAssistants: ReadonlySet<string>,
  t: TrajectoryTranslate,
): TableRecord[] {
  const out: TableRecord[] = []
  for (let index = 0; index < records.length; index++) {
    const record = records[index]
    if (record === undefined) continue
    out.push(record)
    if (record.cell.kind !== 'message' || !collapsedAssistants.has(trajectoryRecordId(record.cell))) continue
    const calls: TableRecord[] = []
    for (let callIndex = index + 1; callIndex < records.length; callIndex++) {
      const candidate = records[callIndex]
      if (candidate === undefined || candidate.collapsedSummary !== undefined
        || (candidate.cell.kind !== 'tool' && candidate.cell.kind !== 'subtool')) break
      calls.push(candidate)
    }
    if (calls.length === 0) continue
    out[out.length - 1] = { ...record, turnEnd: false }
    out.push({
      ...record,
      groupStart: false,
      turnStart: false,
      turnEnd: calls.at(-1)?.turnEnd ?? false,
      collapsedSummary: summarizeAssistantTools(calls, t),
      collapsedSummaryKind: 'assistant',
    })
    index += calls.length
  }
  return out
}

/**
 * Derive the completion state shown by a record.
 * @param record - Record containing error and settlement metadata.
 * @returns Error takes precedence; unfinished compaction and tools remain running.
 */
export function stateOf(record: TableRecord): RecordState {
  if (record.cell.isError) return 'error'
  if (record.cell.kind === 'compacted' && record.cell.timeSeconds === null) return 'running'
  if ((record.cell.kind === 'tool' || record.cell.kind === 'subtool')
    && record.cell.outputDetail === undefined) return 'running'
  return 'complete'
}

/**
 * Translate one record completion state.
 * @param state - Derived completion state.
 * @param t - Trajectory locale translator.
 * @returns Localized status label.
 */
export function statusLabel(state: RecordState, t: TrajectoryTranslate): string {
  if (state === 'error') return t('status.failed')
  if (state === 'running') return t('status.pending')
  return t('status.completed')
}

/**
 * Translate known request failures while preserving provider text.
 * @param request - Recorded error code and provider message.
 * @param t - Trajectory locale translator.
 * @returns Localized known failure, raw provider text, or undefined when absent.
 */
export function requestErrorMessage(
  request: Pick<TrajectoryRequestNumber, 'error' | 'errorCode'>,
  t: TrajectoryTranslate,
): string | undefined {
  if (request.errorCode === 'AUTH') return t('details.failure.auth')
  if (request.error === COMPACTION_INTERRUPTED_ERROR) return t('layout.compactionInterrupted')
  return request.error
}
