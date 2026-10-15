/** Localized primitive label adapters shared by Trajectory inspector views. */

import type { JsonTreeLabels, MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TrajectoryTranslate } from './locales.ts'

/**
 * Build labels for JSON trees rendered by the Trajectory inspector.
 * @param t - Trajectory namespace translator.
 * @returns Localized JSON-tree actions and states.
 */
export function jsonTreeLabels(t: TrajectoryTranslate): JsonTreeLabels {
  return {
    copyValue: t('copy.value'),
    copyJson: t('copy.json'),
    copyPath: t('copy.path'),
    copyPrettyJson: t('copy.prettyJson'),
    copyCompactJson: t('copy.compactJson'),
    copied: t('copied'),
    copyFailed: t('copy.failed'),
    collapseNode: t('collapse'),
    expandNode: t('expand'),
    copyButtonTitle: action => t('copy.optionsHint', { action }),
  }
}

/**
 * Build labels for Markdown rendered by the Trajectory inspector.
 * @param t - Trajectory namespace translator.
 * @returns Localized Markdown actions and section labels.
 */
export function markdownLabels(t: TrajectoryTranslate): MarkdownLabels {
  return {
    code: { copyLabel: t('copy'), copiedLabel: t('copied') },
    footnotes: t('markdown.footnotes'),
  }
}
