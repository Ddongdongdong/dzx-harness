// Web e2e scenario: full-session stats over paged history. A deterministic
// 28-turn log (58 chat messages — more than one 50-message history page)
// seeded cold through the REAL persistence API must render whole-log turn,
// step, and settled-tool counts from sessionStats on first open, and loading
// the older page must NOT change them. This pins the bug the projection fixed:
// the pre-projection window fold recounted per loaded page, so 加载更早 grew
// the counter. Zero model calls; the seed is generated, not recorded, because
// no line of it is model output.
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { createSystemMessage } from '@deepseek-ai/dsh-llm'
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./expected/stats-paged-history', import.meta.url))
const UI_EXPECTED = fileURLToPath(new URL('./expected/stats-paged-history/ui.expected.md', import.meta.url))
const MODE = webSnapshotMode()
const SEED_ID = 'stats-paged-history-web-e2e'

/** Turn count: the 58-message fixture overflows one 50-message page. */
const TURNS = 28
const FULL_COUNTS = `${TURNS} turns ${TURNS + 1} steps`

/**
 * Generate the seed: TURNS closed turns with one short user prompt and reply;
 * the first turn adds one failed tool step. Fixed times pin displayed dates;
 * the empty system head precedes every user message in the current format.
 * @param turns - closed turns to generate.
 * @returns session.jsonl text for {@link seedSession}.
 */
function buildSeed(turns: number): string {
  const lines = [JSON.stringify({
    type: 'session', version: SESSION_FORMAT_VERSION, id: '{{sessionId}}',
    createdAt: 1784974100000, cwd: '{{cwd}}/workspace', isSeeded: false, delegationDepth: 0,
  })]
  let seq = 0
  let time = 1784974100000
  const at = (event: Record<string, unknown>): number => {
    const eventSeq = seq++
    lines.push(JSON.stringify({ ...event, seq: eventSeq, time: time++ }))
    return eventSeq
  }
  for (let turn = 1; turn <= turns; turn++) {
    at({ type: 'turn/start', data: { turn } })
    at({ type: 'step/start', data: { turn, step: 1 } })
    if (turn === 1) {
      at({
        type: 'system/message',
        data: { turn, step: 1, message: createSystemMessage('', '@deepseek-ai/dsh-system-prompt') },
        surfaceOp: 'append',
      })
    }
    at({
      type: 'user/message',
      data: {
        id: `00000000-0000-4000-9000-${String(turn).padStart(12, '0')}`,
        role: 'user',
        content: [{ type: 'text', text: `m${turn}` }],
        source: { kind: 'user' },
      },
      surfaceOp: 'append',
    })
    if (turn === 1) {
      const callId = 'stats-failed-tool'
      at({
        type: 'assistant/message',
        data: {
          stream: [],
          turn,
          step: 1,
          message: {
            id: '00000000-0000-4000-7000-000000000001',
            role: 'assistant',
            content: [{ type: 'tool-call', id: callId, name: 'read', arguments: '{}' }],
            source: { kind: 'model', provider: 'snapshot', model: 'snapshot-replier' },
          },
        },
        surfaceOp: 'append',
      })
      const callSeq = at({
        type: 'tool/call',
        data: { turn, step: 1, callId, name: 'read', arguments: '{}' },
      })
      at({
        type: 'tool/result',
        data: {
          turn,
          step: 1,
          message: {
            id: '00000000-0000-4000-6000-000000000001',
            role: 'user',
            content: [{
              type: 'tool-result',
              toolCallId: callId,
              content: [{ type: 'text', text: 'Error: fixture failure' }],
              isError: true,
            }],
            source: { kind: 'tool', callId },
          },
          error: { name: 'FixtureError', code: 'FIXTURE_FAILURE' },
        },
        surfaceOp: 'append',
        sourceEventSeqs: [callSeq],
      })
      at({ type: 'step/end', data: { turn, step: 1 } })
      at({ type: 'step/start', data: { turn, step: 2 } })
    }
    const replyStep = turn === 1 ? 2 : 1
    at({
      type: 'assistant/message',
      data: {
        stream: [],
        turn,
        step: replyStep,
        message: {
          id: `00000000-0000-4000-8000-${String(turn).padStart(12, '0')}`,
          role: 'assistant',
          content: [{ type: 'text', text: `r${turn}` }],
          source: { kind: 'model', provider: 'snapshot', model: 'snapshot-replier' },
        },
      },
      surfaceOp: 'append',
    })
    at({ type: 'step/end', data: { turn, step: replyStep } })
    at({ type: 'turn/end', data: { turn, reason: { kind: 'completed' } } })
  }
  return `${lines.join('\n')}\n`
}

describe('web e2e: whole-session stats survive history paging', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    if (MODE === 'record') throw new Error('stats-paged-history is a keyless assembled snapshot')
    scaffold = await launchWebScaffold({})
    await seedSession(scaffold, buildSeed(TURNS), SEED_ID)
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('renders full-session counts on the partial tail page and keeps them across load-older', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-stats-paged'))
    const groupRow = page.locator('[role="treeitem"]').first()
    await groupRow.waitFor({ timeout: 15_000 })
    await groupRow.click()
    const sessionRow = page.locator('[role="treeitem"]').nth(1)
    await sessionRow.waitFor({ timeout: 10_000 })
    await sessionRow.click()
    // Settled barrier: the newest recorded reply renders from the tail page.
    await expect.poll(() => page.getByText(`r${TURNS}`, { exact: true }).count(), { timeout: 15_000 }).toBe(1)
    // The tail page is partial (58 messages > one 50-message page): the first
    // turns are NOT loaded, yet the strip already reports the whole log —
    // the sessionStats projection, not the window fold.
    expect(await page.getByText('m1', { exact: true }).count()).toBe(0)
    await expect.poll(() => page.getByText(FULL_COUNTS, { exact: false }).count(), { timeout: 10_000 }).toBe(1)
    const strip = page.getByText(FULL_COUNTS, { exact: false }).locator('..')
    const stripBeforePaging = await strip.textContent()
    await strip.click()
    let dialog = page.getByRole('dialog', { name: 'Session statistics' })
    await expect.poll(() => dialog.count()).toBe(1)
    expect(await dialog.textContent()).toContain('Tool calls1')
    expect(await dialog.textContent()).toContain('Failed tool calls1')

    // 加载更早: prepending the older page must not move ANY strip figure —
    // counts, wall times, or token groups.
    await page.getByRole('button', { name: 'Load earlier' }).click()
    await expect.poll(() => page.getByText('m1', { exact: true }).count(), { timeout: 10_000 }).toBe(1)
    expect(await strip.textContent()).toBe(stripBeforePaging)
    await strip.click()
    dialog = page.getByRole('dialog', { name: 'Session statistics' })
    await expect.poll(() => dialog.count()).toBe(1)
    expect(await dialog.textContent()).toContain('Tool calls1')
    expect(await dialog.textContent()).toContain('Failed tool calls1')
    await page.keyboard.press('Escape')
    await expect.poll(() => dialog.count()).toBe(0)
    // With the whole log loaded, the window mounts one turn-tail footer per
    // settled turn — the loaded-window probe the scroll/perf lanes count now
    // that the strip is whole-log-scoped.
    expect(await page.locator('[data-chat-flow-key^="9:turn-tail"]').count()).toBe(TURNS)
  }, 60_000)

  it('matches the paged-stats aria golden', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-stats-paged-aria'))
    const snapshot = (await captureStableAria(page, '[class*="centerCol"]', scaffold.workspaceCwd))
      .split(SEED_ID).join('{{seededId}}')
    await compareOrRefreshGolden(UI_EXPECTED, snapshot, MODE)
  })

  it('issued zero model calls and stayed clean', async () => {
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, ['ui.expected.md'])
  })
})
