/** Model-facing tool-catalog presentation for the Trajectory inspector. */

import { IconChevronRightOutline14, JsonTree } from '@deepseek-ai/dsh-client-ui-primitives'
import type { JsonTreeProps } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConversationPromptSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TrajectoryTranslate } from './locales.ts'
import { jsonTreeLabels } from './trajectory-presentation-labels.ts'
import css from './TrajectoryTable.module.css'

function ToolGlyph() {
  return (
    <svg
      className={css.toolCatalogIcon}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Render the request tool catalog as expandable parameter-schema entries.
 * @param props - Recorded tools, JSON string wrapping mode, and localized labels.
 * @returns A tool catalog or the localized empty state.
 */
export function TrajectoryToolCatalog({
  tools,
  stringWrapping,
  t,
}: {
  tools: ConversationPromptSnapshot['tools']
  stringWrapping: JsonTreeProps['stringWrapping']
  t: TrajectoryTranslate
}) {
  if (tools.length === 0) return <p className={css.noPayload}>{t('record.toolsMissing')}</p>
  return (
    <div className={css.toolCatalog}>
      {tools.map((tool, index) => (
        <details className={css.toolCatalogItem} key={`${tool.name}:${index}`}>
          <summary className={css.toolCatalogSummary}>
            <IconChevronRightOutline14 className={css.toolCatalogChevron} size={12} />
            <ToolGlyph />
            <span className={css.toolCatalogName}>{tool.name}</span>
            <span className={css.toolCatalogDescription}>{tool.description}</span>
          </summary>
          <div className={css.toolCatalogDefinition}>
            {tool.description !== '' && (
              <p className={css.toolCatalogFullDescription}>{tool.description}</p>
            )}
            <JsonTree
              data={tool.parameters}
              stringWrapping={stringWrapping}
              label={t('record.namedParametersJson', { name: tool.name })}
              labels={jsonTreeLabels(t)}
              className={css.toolCatalogTree}
            />
          </div>
        </details>
      ))}
    </div>
  )
}
