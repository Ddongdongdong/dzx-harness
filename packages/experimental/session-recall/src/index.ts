/**
 * Opt-in automatic recall of relevant same-workspace Session snapshots.
 *
 * @module @deepseek-ai/dsh-experimental-session-recall
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { Message, UserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionSearchHit } from '@deepseek-ai/dsh-session-query'
import {
  MAX_REFERENCES,
  parseSessionReferenceText,
  type SessionReferenceInput,
} from '@deepseek-ai/dsh-session-reference'
import { deadline, MAX_TIMER_DELAY_MS, timeoutOf } from '@deepseek-ai/dsh-timeout'
import { planRecallQueries, rankRecallCandidates } from './query-plan.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'experimental-session-recall'

/** Runtime services required to retrieve and prepare durable recall context. */
export const inject = ['agents', 'sessionQuery', 'sessionReferenceResolver']

/** Behavior after an operational recall failure. */
export type RecallFailureMode = 'continue' | 'reject'

/** Automatic recall limits and failure policy. */
export interface Config {
  /** Maximum accepted user characters inspected while planning queries. Defaults to 12000. */
  maxSourceCharacters?: number
  /** Minimum Unicode code points in one planned query. Defaults to 2. */
  minTermCharacters?: number
  /** Maximum Unicode code points in one planned query. Defaults to 80. */
  maxTermCharacters?: number
  /** Maximum literal queries issued for one first step. Defaults to 6. */
  maxQueryTerms?: number
  /** Maximum sessions requested from each literal query. Defaults to 8. */
  perTermResults?: number
  /** Minimum distinct planned queries a session must match. Defaults to 1. */
  minMatchedTerms?: number
  /** Maximum prior sessions added to one step. Defaults to 3. */
  maxSessions?: number
  /** Total search, title, and snapshot preparation deadline in milliseconds. Defaults to 5000. */
  timeoutMs?: number
  /** Continue the request with a warning, or reject it, after an operational failure. Defaults to `continue`. */
  failureMode?: RecallFailureMode
}

/** Schemastery validation for {@link Config}. */
export const Config: z<Config> = z.object({
  maxSourceCharacters: z.number().step(1).min(1).default(12_000),
  minTermCharacters: z.number().step(1).min(1).default(2),
  maxTermCharacters: z.number().step(1).min(1).default(80),
  maxQueryTerms: z.number().step(1).min(1).max(32).default(6),
  perTermResults: z.number().step(1).min(1).max(100).default(8),
  minMatchedTerms: z.number().step(1).min(1).max(32).default(1),
  maxSessions: z.number().step(1).min(1).max(MAX_REFERENCES).default(3),
  timeoutMs: z.number().min(1).max(MAX_TIMER_DELAY_MS).default(5_000),
  failureMode: z.union(['continue', 'reject'] as const).default('continue'),
})

/** Stable error categories returned when configured strict recall rejects a step. */
export type SessionRecallErrorCode =
  | 'SESSION_RECALL_INVALID_CONFIG'
  | 'SESSION_RECALL_FAILED'
  | 'SESSION_RECALL_TIMEOUT'

/** Operational or configuration failure owned by automatic session recall. */
export class SessionRecallError extends Error {
  override name = 'SessionRecallError'

  /**
   * @param message - concise failure description.
   * @param code - stable machine-readable category.
   * @param options - optional causal error.
   */
  constructor(
    message: string,
    readonly code: SessionRecallErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

interface ResolvedConfig {
  maxSourceCharacters: number
  minTermCharacters: number
  maxTermCharacters: number
  maxQueryTerms: number
  perTermResults: number
  minMatchedTerms: number
  maxSessions: number
  timeoutMs: number
  failureMode: RecallFailureMode
}

const RECALL_TIMEOUT_CODE = 'SESSION_RECALL_DEADLINE'

function positiveSafeInteger(name: string, value: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new SessionRecallError(
      `experimental-session-recall: ${name} must be an integer between 1 and ${String(maximum)}`,
      'SESSION_RECALL_INVALID_CONFIG',
    )
  }
  return value
}

function resolveConfig(config: Config): ResolvedConfig {
  const resolved: ResolvedConfig = {
    maxSourceCharacters: positiveSafeInteger('maxSourceCharacters', config.maxSourceCharacters ?? 12_000),
    minTermCharacters: positiveSafeInteger('minTermCharacters', config.minTermCharacters ?? 2),
    maxTermCharacters: positiveSafeInteger('maxTermCharacters', config.maxTermCharacters ?? 80),
    maxQueryTerms: positiveSafeInteger('maxQueryTerms', config.maxQueryTerms ?? 6, 32),
    perTermResults: positiveSafeInteger('perTermResults', config.perTermResults ?? 8, 100),
    minMatchedTerms: positiveSafeInteger('minMatchedTerms', config.minMatchedTerms ?? 1, 32),
    maxSessions: positiveSafeInteger('maxSessions', config.maxSessions ?? 3, MAX_REFERENCES),
    timeoutMs: config.timeoutMs ?? 5_000,
    failureMode: config.failureMode ?? 'continue',
  }
  if (resolved.minTermCharacters > resolved.maxTermCharacters) {
    throw new SessionRecallError(
      'experimental-session-recall: minTermCharacters must not exceed maxTermCharacters',
      'SESSION_RECALL_INVALID_CONFIG',
    )
  }
  if (resolved.minMatchedTerms > resolved.maxQueryTerms) {
    throw new SessionRecallError(
      'experimental-session-recall: minMatchedTerms must not exceed maxQueryTerms',
      'SESSION_RECALL_INVALID_CONFIG',
    )
  }
  if (!Number.isFinite(resolved.timeoutMs)
    || resolved.timeoutMs < 1
    || resolved.timeoutMs > MAX_TIMER_DELAY_MS) {
    throw new SessionRecallError(
      `experimental-session-recall: timeoutMs must be between 1 and ${String(MAX_TIMER_DELAY_MS)}`,
      'SESSION_RECALL_INVALID_CONFIG',
    )
  }
  if (resolved.failureMode !== 'continue' && resolved.failureMode !== 'reject') {
    throw new SessionRecallError(
      `experimental-session-recall: unsupported failureMode ${String(resolved.failureMode)}`,
      'SESSION_RECALL_INVALID_CONFIG',
    )
  }
  return resolved
}

function directUserText(messages: readonly UserMessage[]): string {
  return messages
    .filter(message => message.source.kind === 'user')
    .flatMap(message => message.content)
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

function carriesExplicitReference(messages: readonly UserMessage[]): boolean {
  if (messages.some(message => message.source.kind === 'session-reference')) return true
  return messages.some(message => message.source.kind === 'user'
    && message.content.some(block => block.type === 'text'
      && parseSessionReferenceText(block.text).references.length > 0))
}

function recalledSessionIds(messages: readonly Message[]): Set<string> {
  const ids = new Set<string>()
  for (const message of messages) {
    if (message.source.kind !== 'session-reference') continue
    for (const reference of message.source.references) ids.add(reference.sessionId)
  }
  return ids
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function referenceInputs(
  ctx: Context,
  hits: readonly SessionSearchHit[],
  signal: AbortSignal,
): Promise<SessionReferenceInput[]> {
  const ids = hits.map(hit => hit.header.id)
  const titles = await ctx.sessionQuery.readTitleSnapshots(ids, signal)
  const labels = new Map<SessionId, string>()
  for (const title of titles) {
    if (title.status === 'fulfilled' && title.value.title !== undefined) {
      labels.set(title.sessionId, title.value.title.title)
    }
  }
  return ids.map(sessionId => ({
    sessionId,
    label: `Automatic recall: ${labels.get(sessionId) ?? sessionId}`,
  }))
}

/**
 * Install same-workspace automatic recall on accepted first steps.
 * @param ctx - plugin context; the listener is disposed with it.
 * @param config - query, ranking, timeout, and failure configuration.
 * @throws {@link SessionRecallError} when directly supplied configuration is invalid.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const options = resolveConfig(config)
  ctx.on('agent/pre-step', async (
    { agent, step, signal },
    next,
  ): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject' || step !== 1 || signal.aborted) return decision
    if (carriesExplicitReference(decision.messages)) return decision
    const cwd = agent.session.header.cwd
    if (cwd === undefined) return decision
    const queries = planRecallQueries(directUserText(decision.messages), options)
    if (queries.length === 0) return decision
    const excluded = recalledSessionIds(agent.session.deriveMessages())
    excluded.add(agent.id)

    using operation = deadline(signal, options.timeoutMs, RECALL_TIMEOUT_CODE)
    try {
      const pages: SessionSearchHit[][] = []
      for (const query of queries) {
        const page = await ctx.sessionQuery.searchSessions({
          query,
          sessionFilters: [{ kind: 'cwd', values: [cwd] }],
          eventFilters: [{ kind: 'surface', values: ['current'] }],
          limit: options.perTermResults,
        }, { signal: operation.signal })
        operation.signal.throwIfAborted()
        pages.push([...page.items])
      }
      const ranked = rankRecallCandidates(
        pages,
        options.perTermResults,
        options.minMatchedTerms,
        options.maxSessions,
        excluded,
      )
      if (ranked.length === 0) return decision
      const references = await referenceInputs(ctx, ranked.map(candidate => candidate.hit), operation.signal)
      const prepared = await ctx.sessionReferenceResolver.prepare(agent, [], references, operation.signal)
      operation.signal.throwIfAborted()
      if (prepared.additionalContext === undefined) return decision
      return { ...decision, messages: [...decision.messages, prepared.additionalContext] }
    } catch (error: unknown) {
      signal.throwIfAborted()
      const timeout = timeoutOf(operation.signal, RECALL_TIMEOUT_CODE)
      const failure = timeout === undefined
        ? new SessionRecallError(
          `automatic session recall failed: ${errorMessage(error)}`,
          'SESSION_RECALL_FAILED',
          { cause: error },
        )
        : new SessionRecallError(
          `automatic session recall exceeded ${String(timeout.timeoutMs)}ms`,
          'SESSION_RECALL_TIMEOUT',
          { cause: error },
        )
      if (options.failureMode === 'reject') throw failure
      ctx.logger.warn('%s', failure)
      return decision
    }
  }, { prepend: true })
}
