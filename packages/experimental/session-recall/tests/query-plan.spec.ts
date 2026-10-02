import { describe, expect, it } from 'vitest'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionSearchHit } from '@deepseek-ai/dsh-session-query'
import { planRecallQueries, rankRecallCandidates } from '../src/query-plan.ts'

function hit(id: string, createdAt: number): SessionSearchHit {
  const sessionId = SessionId(id)
  return {
    header: { version: 3, id: sessionId, createdAt, cwd: 'C:\\repo', isSeeded: false },
    live: true,
    persisted: false,
    bestMatch: {
      sessionId,
      seq: SessionSeq(0),
      type: 'user/message',
      time: createdAt,
      surface: 'current',
      snippet: id,
    },
  }
}

describe('recall query planning', () => {
  it('prioritizes paths and code identifiers while retaining Chinese terms', () => {
    const queries = planRecallQueries(
      '继续开发 packages/session-query/session-query-sqlite 的 SessionRecallEngine 设计',
      { maxSourceCharacters: 200, minTermCharacters: 2, maxTermCharacters: 80, maxQueryTerms: 16 },
    )
    expect(queries[0]).toContain('packages/session-query/session-query-sqlite')
    expect(queries).toContain('SessionRecallEngine')
    expect(queries.some(query => query.includes('开发'))).toBe(true)
    expect(new Set(queries.map(query => query.toLowerCase())).size).toBe(queries.length)
  })

  it('bounds inspected source and emitted query count', () => {
    expect(planRecallQueries(
      'alpha beta gamma delta epsilon',
      { maxSourceCharacters: 10, minTermCharacters: 2, maxTermCharacters: 20, maxQueryTerms: 2 },
    )).toHaveLength(2)
  })
})

describe('recall rank fusion', () => {
  it('prefers multi-query matches, excludes known sessions, and breaks ties deterministically', () => {
    const alpha = hit('alpha', 10)
    const beta = hit('beta', 30)
    const gamma = hit('gamma', 20)
    const ranked = rankRecallCandidates(
      [[alpha, beta], [gamma, alpha], [beta, gamma]],
      4,
      2,
      2,
      new Set(['beta']),
    )
    expect(ranked.map(candidate => candidate.hit.header.id)).toEqual(['gamma', 'alpha'])
    expect(ranked.map(candidate => candidate.matchedTerms)).toEqual([2, 2])
  })
})
