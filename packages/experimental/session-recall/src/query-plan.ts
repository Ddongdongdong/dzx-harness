/**
 * Deterministic lexical query planning and bounded cross-query rank fusion for
 * automatic session recall.
 *
 * @module @deepseek-ai/dsh-experimental-session-recall/query-plan
 */

import type { SessionSearchHit } from '@deepseek-ai/dsh-session-query'

/** Limits applied while deriving full-text queries from one accepted user batch. */
export interface RecallQueryPlanOptions {
  /** Maximum source characters inspected from the accepted user batch. */
  maxSourceCharacters: number
  /** Minimum Unicode code points in one emitted query. */
  minTermCharacters: number
  /** Maximum Unicode code points in one emitted query. */
  maxTermCharacters: number
  /** Maximum number of emitted queries. */
  maxQueryTerms: number
}

interface QueryCandidate {
  query: string
  score: number
  index: number
}

/** One fused session hit and the evidence used to order it. */
export interface RankedRecallCandidate {
  /** Search hit retained from its strongest observed rank. */
  hit: SessionSearchHit
  /** Number of distinct planned queries that matched the session. */
  matchedTerms: number
  /** Sum of bounded per-query rank contributions. */
  score: number
}

const PATH_TOKEN = /(?:[A-Za-z]:[\\/]|\.{0,2}[\\/])?[\p{L}\p{N}_.@-]+(?:[\\/][\p{L}\p{N}_.@-]+)+/gu
const IDENTIFIER_TOKEN = /[\p{L}\p{N}][\p{L}\p{N}_.@-]*/gu

function codePointLength(value: string): number {
  return Array.from(value).length
}

function takeCodePoints(value: string, limit: number): string {
  return Array.from(value).slice(0, limit).join('')
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * Derive a small set of literal full-text queries from accepted user text.
 * Paths and code-like identifiers lead, followed by adjacent word phrases and
 * individual Unicode words. NFKC normalization and case folding make duplicate
 * suppression deterministic without changing the source message.
 *
 * @param text - concatenated direct-user text from the accepted step.
 * @param options - source and emitted-query bounds.
 * @returns distinct literal queries in descending specificity order.
 */
export function planRecallQueries(
  text: string,
  options: RecallQueryPlanOptions,
): string[] {
  const source = takeCodePoints(text.normalize('NFKC'), options.maxSourceCharacters)
  const byKey = new Map<string, QueryCandidate>()
  const add = (raw: string, score: number, index: number): void => {
    const query = raw.trim().replace(/\s+/gu, ' ')
    const length = codePointLength(query)
    if (length < options.minTermCharacters || length > options.maxTermCharacters) return
    const key = query.toLowerCase()
    const candidate = { query, score: score + Math.min(length, 64), index }
    const existing = byKey.get(key)
    if (existing === undefined
      || candidate.score > existing.score
      || (candidate.score === existing.score && candidate.index < existing.index)) {
      byKey.set(key, candidate)
    }
  }

  for (const match of source.matchAll(PATH_TOKEN)) {
    add(match[0], 400, match.index)
  }
  for (const match of source.matchAll(IDENTIFIER_TOKEN)) {
    const token = match[0]
    const codeLike = /[_.@-]/u.test(token) || /\d/u.test(token)
    add(token, codeLike ? 300 : 100, match.index)
  }

  const segmenter = new Intl.Segmenter('und', { granularity: 'word' })
  const words = [...segmenter.segment(source)]
    .filter(segment => segment.isWordLike)
  for (const word of words) {
    add(word.segment, 100, word.index)
  }

  return [...byKey.values()]
    .sort((left, right) => right.score - left.score
      || left.index - right.index
      || compareText(left.query, right.query))
    .slice(0, options.maxQueryTerms)
    .map(candidate => candidate.query)
}

/**
 * Fuse independently ranked search pages without depending on provider scores.
 * A session matching more queries wins; equal matches use the sum of descending
 * page-rank contributions, newest creation time, then opaque id.
 *
 * @param pages - one first page for each planned query, in query order.
 * @param perTermResults - requested page size and maximum rank contribution.
 * @param minMatchedTerms - minimum distinct query matches required.
 * @param maxSessions - maximum candidates returned.
 * @param excludedSessionIds - current and already-recalled session ids.
 * @returns fused candidates in deterministic order.
 */
export function rankRecallCandidates(
  pages: readonly (readonly SessionSearchHit[])[],
  perTermResults: number,
  minMatchedTerms: number,
  maxSessions: number,
  excludedSessionIds: ReadonlySet<string>,
): RankedRecallCandidate[] {
  const accumulated = new Map<string, {
    hit: SessionSearchHit
    matchedTerms: number
    score: number
    bestRank: number
  }>()
  for (const page of pages) {
    const seenInPage = new Set<string>()
    page.forEach((hit, rank) => {
      const id = hit.header.id
      if (excludedSessionIds.has(id) || seenInPage.has(id)) return
      seenInPage.add(id)
      const contribution = Math.max(1, perTermResults - rank)
      const current = accumulated.get(id)
      if (current === undefined) {
        accumulated.set(id, { hit, matchedTerms: 1, score: contribution, bestRank: rank })
        return
      }
      current.matchedTerms += 1
      current.score += contribution
      if (rank < current.bestRank) {
        current.hit = hit
        current.bestRank = rank
      }
    })
  }
  return [...accumulated.values()]
    .filter(candidate => candidate.matchedTerms >= minMatchedTerms)
    .sort((left, right) => right.matchedTerms - left.matchedTerms
      || right.score - left.score
      || right.hit.header.createdAt - left.hit.header.createdAt
      || compareText(left.hit.header.id, right.hit.header.id))
    .slice(0, maxSessions)
    .map(({ hit, matchedTerms, score }) => ({ hit, matchedTerms, score }))
}
