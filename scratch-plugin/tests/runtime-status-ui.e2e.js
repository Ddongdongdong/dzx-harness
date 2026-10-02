import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  launchWebScaffold, seedSession, watchConsole,
} from '../../apps/web/tests/scaffold.ts'
import { expandOwningTurnProcess } from '../../apps/web/tests/support.ts'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const FIXTURE = fileURLToPath(new URL('./fixtures/runtime-status.session.v3.jsonl', import.meta.url))
const OVERLAY = join(ROOT, 'scratch-plugin', 'tests', 'runtime-status-ui.overlay.yml')
const SCREENSHOT = join(ROOT, 'scratch-plugin', 'artifacts', 'runtime-status-cards.png')
const requireFromWeb = createRequire(join(ROOT, 'apps', 'web', 'package.json'))
const { chromium } = requireFromWeb('playwright')
const browserPath = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(existsSync)

describe('tutorial runtime-status cards', () => {
  let scaffold
  let browser
  let page
  let tripwire

  beforeAll(async () => {
    if (browserPath === undefined) throw new Error('runtime-status UI validation requires Edge or Chrome')
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    await seedSession(scaffold, await readFile(FIXTURE, 'utf8'), 'runtime-status-ui-e2e')
    browser = await chromium.launch({ headless: true, executablePath: browserPath })
    page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1280, height: 900 } })
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    const groupRow = page.locator('[role="treeitem"]').first()
    await groupRow.waitFor({ timeout: 15_000 })
    await groupRow.click()
    const sessionRow = page.locator('[role="treeitem"]').nth(1)
    await sessionRow.waitFor({ timeout: 10_000 })
    await sessionRow.click()
    const current = page.locator('[data-tool="current_project"]')
    await expandOwningTurnProcess(page, current)
    await current.waitFor({ timeout: 15_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('renders replay-stable project and system cards', async () => {
    const current = page.locator('[data-tool="current_project"]')
    const system = page.locator('[data-tool="system_status"]')
    expect(await current.count()).toBe(1)
    expect(await system.count()).toBe(1)
    await current.getByText('当前项目', { exact: true }).waitFor()
    await current.getByText('v22.19.0', { exact: true }).waitFor()
    await system.getByText('系统状态', { exact: true }).waitFor()
    await system.getByText('8', { exact: true }).waitFor()
    await system.getByText('20.00 GiB / 32.00 GiB', { exact: true }).waitFor()
    expect(await system.locator('.tutorial-runtime-meter > span').getAttribute('style')).toContain('62.5%')
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
    await mkdir(dirname(SCREENSHOT), { recursive: true })
    await page.locator('[class*="centerCol"]').screenshot({ path: SCREENSHOT })
  }, 30_000)
})
