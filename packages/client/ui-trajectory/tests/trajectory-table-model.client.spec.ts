import { describe, expect, it } from 'vitest'
import {
  collapseAssistantRecords, flattenRecords, indexRequestNumbers, requestIdentity, requestKey,
  sectionLabel, stateOf,
} from '../src/client/trajectory-table-model.ts'
import type { TrajectoryCellProps } from '../src/client/trajectory-record.ts'
import type { TrajectoryTranslate } from '../src/client/locales.ts'

const t: TrajectoryTranslate = (key, values) => `${key}${values === undefined ? '' : JSON.stringify(values)}`

describe('trajectory table request model', () => {
  const cell = (index: number, kind: TrajectoryCellProps['kind'], text: string = kind): TrajectoryCellProps => ({
    index, kind, text, timeSeconds: 0,
  })

  it('keeps assistant and compaction identities disjoint', () => {
    expect(requestIdentity({ group: 'Step 1', number: 1, turn: 2, step: 0 })).toBe('assistant\u00002\u00000')
    expect(requestIdentity({ purpose: 'compaction', group: 'Compaction 3', number: 2, seq: 7, turn: null, step: 0 }))
      .toBe('compaction\u00007')
  })

  it('indexes the latest request number for each display group', () => {
    const requests = [
      { group: 'Step 1', number: 1, turn: 1, step: 0 },
      { group: 'Step 1', number: 3, turn: 1, step: 0 },
      { purpose: 'compaction' as const, group: 'Compaction 2', number: 4, seq: 8, turn: null, step: 0 as const },
    ]
    expect(indexRequestNumbers(requests)).toEqual(new Map([
      [requestKey(1, 'Step 1'), 3],
      [requestKey(null, 'Compaction 2'), 4],
    ]))
  })

  it('labels between-turn records through the locale owner', () => {
    expect(sectionLabel(null, t)).toContain('section.betweenTurns')
    expect(sectionLabel(4, t)).toContain('turn.label')
  })

  it('flattens grouped turns and preserves section boundaries', () => {
    const records = flattenRecords([
      { turn: 1, groups: [{ title: 'Step 1', cells: [cell(1, 'user'), cell(2, 'message')] }] },
      { turn: null, groups: [{ title: 'Between turns', cells: [cell(3, 'compacted')] }] },
    ])
    expect(records.map(record => [record.section, record.groupStart, record.turnStart, record.turnEnd]))
      .toEqual([[0, true, true, false], [0, false, false, true], [1, true, true, true]])
  })

  it('folds consecutive assistant tool calls and identifies running rows', () => {
    const records = flattenRecords([{
      turn: 1,
      groups: [{ title: 'Step 1', cells: [cell(1, 'message', 'Assistant'), cell(2, 'tool', 'bash · args')] }],
    }])
    const folded = collapseAssistantRecords(records, new Set(['message\u0000index\u00001']), t)
    expect(folded).toHaveLength(2)
    expect(folded[1]?.collapsedSummary).toContain('summary.toolCalls.one')
    expect(stateOf(records[1]!)).toBe('running')
  })
})
