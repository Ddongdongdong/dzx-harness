/** System-prompt and tool-catalog diff presentation for the Trajectory inspector. */

import type { ConversationPromptSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TrajectoryTranslate } from './locales.ts'
import { promptDiffLines } from './trajectory-inspector-model.ts'
import css from './TrajectoryTable.module.css'

function PromptDiffSection({
  title,
  before,
  after,
}: {
  title: string
  before: string
  after: string
}) {
  const lines = promptDiffLines(before, after)
  if (lines.length === 0) return null
  return (
    <section className={css.promptDiffSection}>
      <h3 className={css.promptDiffTitle}>{title}</h3>
      <pre className={css.promptDiff}>
        {lines.map((line, index) => (
          <span className={css[`promptDiffLine${line.kind}`]} key={index}>
            {line.text || ' '}
            {'\n'}
          </span>
        ))}
      </pre>
    </section>
  )
}

/**
 * Render changed system-prompt and tool-catalog sections between two requests.
 * @param props - Adjacent model-visible prompt snapshots and localized labels.
 * @returns Diff sections for changed prompt inputs.
 */
export function SystemPromptDiff({
  before,
  after,
  t,
}: {
  before: ConversationPromptSnapshot
  after: ConversationPromptSnapshot
  t: TrajectoryTranslate
}) {
  const toolsBefore = JSON.stringify(before.tools, null, 2)
  const toolsAfter = JSON.stringify(after.tools, null, 2)
  return (
    <div className={css.promptDiffSections}>
      {before.system !== after.system && (
        <PromptDiffSection
          title={t('record.systemPrompt')}
          before={before.system}
          after={after.system}
        />
      )}
      {toolsBefore !== toolsAfter && (
        <PromptDiffSection
          title={t('record.tools')}
          before={toolsBefore}
          after={toolsAfter}
        />
      )}
    </div>
  )
}
