import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionQueryEngine from '@deepseek-ai/dsh-session-query'
import type {
  SessionEventSearchPage,
  SessionEventSearchRequest,
  SessionSearchExecContext,
  SessionSearchHit,
  SessionSearchPage,
  SessionSearchRequest,
} from '@deepseek-ai/dsh-session-query'
import SessionReferenceResolver, { formatSessionReferenceMention } from '@deepseek-ai/dsh-session-reference'
import * as sessionRecall from '../src/index.ts'
import type { Config } from '../src/index.ts'

class TestSessionQuery extends SessionQueryEngine {
  readonly requests: SessionSearchRequest[] = []
  hits: SessionSearchHit[] = []
  failure: unknown

  override searchSessions(
    request: SessionSearchRequest,
    _exec?: SessionSearchExecContext,
  ): Promise<SessionSearchPage<SessionSearchHit>> {
    this.requests.push(structuredClone(request))
    if (this.failure !== undefined) return Promise.reject(this.failure)
    return Promise.resolve({ items: this.hits })
  }

  override searchEvents(
    _request: SessionEventSearchRequest,
    _exec?: SessionSearchExecContext,
  ): Promise<SessionEventSearchPage> {
    return Promise.reject(new Error('session-recall does not search within one session'))
  }
}

async function harness(config: Config = {}) {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(TestSessionQuery)
  await ctx.plugin(SessionReferenceResolver, { maxReferenceBytes: 4096 })
  const recall = await ctx.plugin(sessionRecall, config)
  return { ctx, recall, query: ctx.sessionQuery as TestSessionQuery }
}

function agent(ctx: Context, id: string, cwd: string): Agent {
  const session = ctx.sessions.create(SessionId(id), { meta: { cwd } })
  return { id: session.id, session, options: {}, ctx } as Agent
}

function sourceHit(ctx: Context, id: string, cwd: string, text: string, createdAt: number): SessionSearchHit {
  const session = ctx.sessions.create(SessionId(id), { meta: { cwd, createdAt } })
  const event = session.append('user/message', createUserMessage({
    content: [{ type: 'text', text }], source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  return {
    header: session.header,
    live: true,
    persisted: false,
    bestMatch: {
      sessionId: session.id,
      seq: event.seq,
      type: event.type,
      time: event.time,
      surface: 'current',
      snippet: text,
    },
  }
}

async function fire(ctx: Context, target: Agent, text: string, turn = 1) {
  const direct = createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
  return agentEvents(ctx, target).waterfall('agent/pre-step', {
    messages: [direct], turn, step: 1, signal: new AbortController().signal,
  }, () => Promise.resolve({ kind: 'enter' as const, messages: [direct] }))
}

describe('automatic session recall', () => {
  it('adds a bounded same-workspace reference and does not recall it twice', async () => {
    const { ctx, query } = await harness({ maxQueryTerms: 2 })
    const target = agent(ctx, 'target', 'C:\\repo')
    query.hits = [sourceHit(ctx, 'source', 'C:\\repo', 'quantum scheduler decision', 10)]

    const first = await fire(ctx, target, 'continue quantum scheduler')
    expect(first.kind).toBe('enter')
    if (first.kind !== 'enter') throw new Error('expected admitted step')
    expect(first.messages).toHaveLength(2)
    expect(first.messages[1]?.source).toMatchObject({
      kind: 'session-reference',
      references: [{ sessionId: 'source', label: 'Automatic recall: source' }],
    })
    expect(query.requests[0]).toMatchObject({
      sessionFilters: [{ kind: 'cwd', values: ['C:\\repo'] }],
      eventFilters: [{ kind: 'surface', values: ['current'] }],
    })
    for (const message of first.messages) {
      target.session.append('user/message', message, { surfaceOp: 'append' })
    }

    const second = await fire(ctx, target, 'continue quantum scheduler', 2)
    expect(second).toMatchObject({ kind: 'enter', messages: [expect.any(Object)] })
    await ctx.fiber.dispose()
  })

  it('defers to an explicit session mention without issuing a search', async () => {
    const { ctx, query } = await harness()
    const target = agent(ctx, 'target-explicit', 'C:\\repo')
    sourceHit(ctx, 'explicit-source', 'C:\\repo', 'explicit fact', 10)
    const mention = formatSessionReferenceMention({
      sessionId: SessionId('explicit-source'), label: 'Explicit',
    })

    const decision = await fire(ctx, target, `Use ${mention}`)
    expect(decision).toMatchObject({ kind: 'enter', messages: [expect.any(Object), expect.any(Object)] })
    expect(query.requests).toEqual([])
    await ctx.fiber.dispose()
  })

  it('continues with a warning or rejects according to failureMode', async () => {
    const continuing = await harness({ maxQueryTerms: 1 })
    const warning = vi.spyOn(continuing.ctx.logger, 'warn').mockImplementation(() => undefined)
    continuing.query.failure = new Error('index unavailable')
    const continued = await fire(continuing.ctx, agent(continuing.ctx, 'continue', 'C:\\repo'), 'continue work')
    expect(continued).toMatchObject({ kind: 'enter', messages: [expect.any(Object)] })
    expect(warning).toHaveBeenCalledOnce()
    await continuing.ctx.fiber.dispose()

    const strict = await harness({ failureMode: 'reject', maxQueryTerms: 1 })
    strict.query.failure = new Error('index unavailable')
    await expect(fire(strict.ctx, agent(strict.ctx, 'strict', 'C:\\repo'), 'continue work'))
      .rejects.toMatchObject({ code: 'SESSION_RECALL_FAILED' })
    await strict.ctx.fiber.dispose()
  })

  it('removes the listener with its plugin fiber', async () => {
    const { ctx, recall, query } = await harness()
    await recall.dispose()
    const decision = await fire(ctx, agent(ctx, 'disposed', 'C:\\repo'), 'continue work')
    expect(decision).toMatchObject({ kind: 'enter', messages: [expect.any(Object)] })
    expect(query.requests).toEqual([])
    await ctx.fiber.dispose()
  })

  it('fails invalid cross-field configuration at load', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(TestSessionQuery)
    await ctx.plugin(SessionReferenceResolver)
    await expect(ctx.plugin(sessionRecall, { minMatchedTerms: 3, maxQueryTerms: 2 }))
      .rejects.toMatchObject({ code: 'SESSION_RECALL_INVALID_CONFIG' })
    await ctx.fiber.dispose()
  })
})
