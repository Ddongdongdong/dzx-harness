/** Markdown, source-block, attachment, and tool-call presentation for the Trajectory inspector. */

import { useMemo } from 'react'
import {
  FileTypeIcon,
  fileExtension,
  fileSizeText,
  IconChevronRightOutline14,
  MarkdownText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { RenderMessageImages } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TrajectoryTranslate } from './locales.ts'
import { markdownLabels } from './trajectory-presentation-labels.ts'
import type { TrajectoryCellProps, TrajectorySourceBlock } from './trajectory-record.ts'
import { isToolCallOnly } from './trajectory-record-presentation.ts'
import css from './TrajectoryTable.module.css'

function markdownSource(cell: TrajectoryCellProps): string | undefined {
  if (cell.kind === 'user' || cell.kind === 'context') return cell.inputDetail
  if (cell.kind === 'message' || cell.kind === 'compacted') return cell.outputDetail
  return undefined
}

function MarkdownFragment({
  text,
  rendered,
  preview,
  variant = 'body',
  t,
}: {
  text: string
  rendered: boolean
  preview: boolean
  variant?: 'body' | 'compact'
  t: TrajectoryTranslate
}) {
  const labels = useMemo(() => markdownLabels(t), [t])
  if (rendered) {
    return (
      <div className={preview ? css.markdownPreview : css.markdownPayload}>
        <MarkdownText text={text} labels={labels} variant={variant} />
      </div>
    )
  }
  return (
    <pre className={`${css.payload} ${preview ? css.payloadPreview : ''}`}>
      {text}
    </pre>
  )
}

function SourceBlocks({
  blocks,
  onOpenCall,
  t,
}: {
  blocks: readonly TrajectorySourceBlock[]
  onOpenCall: (callId: string) => void
  t: TrajectoryTranslate
}) {
  const attachments = new Map(recordAttachments(blocks, t).map(entry => [entry.index, entry]))
  return (
    <div className={css.sourceBlocks}>
      {blocks.map((block, index) => {
        const attachment = attachments.get(index)
        return attachment !== undefined ? (
          <details className={css.attachmentDisclosure} key={index}>
            <summary>
              <span className={css.sourceBlockLabel}>
                {t('block.label', { index: index + 1, type: block.type })}
              </span>
              <span className={css.attachmentName} title={attachment.name}>
                {attachment.name}
              </span>
            </summary>
            <pre className={css.sourceBlockContent}>{block.content}</pre>
          </details>
        )
          : (
            <section className={css.sourceBlock} key={index}>
              {block.callId !== undefined
                ? (
                  <button
                    type="button"
                    className={css.sourceBlockJumpTarget}
                    aria-label={t('block.openSummary', { index: index + 1 })}
                    title={t('block.openSummaryTitle')}
                    onClick={() => {
                      if (block.callId !== undefined) onOpenCall(block.callId)
                    }}
                  >
                    <span className={css.sourceBlockLabel}>
                      {t('block.label', { index: index + 1, type: block.type })}
                    </span>
                    <IconChevronRightOutline14 className={css.sourceBlockJumpIcon} size={12} />
                  </button>
                )
                : (
                  <div className={css.sourceBlockHeader}>
                    <span className={css.sourceBlockLabel}>
                      {t('block.label', { index: index + 1, type: block.type })}
                    </span>
                  </div>
                )}
              <pre className={css.sourceBlockContent}>{block.content}</pre>
            </section>
          )
      })}
    </div>
  )
}

function recordAttachments(
  blocks: readonly TrajectorySourceBlock[] | undefined,
  t: TrajectoryTranslate,
) {
  let imageIndex = 0
  return (blocks ?? []).flatMap((block, index) => {
    const ref = block.attachment ?? block.file
    if (ref === undefined) return []
    if (block.attachment !== undefined) imageIndex += 1
    return [{
      block,
      index,
      name: ref.name ?? t('attachment.imageName', { index: imageIndex }),
      metadata: [
        block.attachment?.mediaType ?? fileExtension(ref.name ?? '').toUpperCase(),
        fileSizeText(ref.bytes),
        ...(block.attachment === undefined ? [] : [`${block.attachment.width} × ${block.attachment.height}`]),
      ].filter(Boolean).join(' · '),
    }]
  })
}

function RecordAttachments({
  blocks,
  preview,
  renderImages,
  t,
}: {
  blocks: readonly TrajectorySourceBlock[] | undefined
  preview: boolean
  renderImages: RenderMessageImages
  t: TrajectoryTranslate
}) {
  const attachments = recordAttachments(blocks, t)
  if (attachments.length === 0) return null
  return (
    <ul
      className={preview ? `${css.attachments} ${css.attachmentsPreview}` : css.attachments}
      aria-label={t('attachment.list')}
    >
      {attachments.map(({ block, index, name, metadata }) => (
        <li className={css.attachmentRow} key={index}>
          {block.attachment !== undefined
            ? renderImages({
              images: [{ attachment: block.attachment, label: name }],
              align: 'start',
              thumbnail: true,
            })
            : <span className={css.attachmentIcon}><FileTypeIcon path={name} /></span>}
          <div className={css.attachmentInfo}>
            <span className={css.attachmentName} title={name}>{name}</span>
            <span className={css.attachmentMetadata}>{metadata}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function AssistantToolCalls({
  blocks,
  preview,
  onOpenCall,
  t,
}: {
  blocks: readonly TrajectorySourceBlock[] | undefined
  preview: boolean
  onOpenCall: (callId: string) => void
  t: TrajectoryTranslate
}) {
  const calls = blocks?.filter(block => block.type === 'tool-call') ?? []
  if (calls.length === 0) return null
  return (
    <ul className={preview
      ? `${css.assistantToolCalls} ${css.assistantToolCallsPreview}`
      : css.assistantToolCalls}
    >
      {calls.map((call, index) => (
        <li key={call.callId ?? index}>
          <button
            type="button"
            className={css.assistantToolCallButton}
            title={t('block.openSummaryTitle')}
            onClick={() => {
              if (call.callId !== undefined) onOpenCall(call.callId)
            }}
          >
            <svg
              className={css.assistantToolCallIcon}
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
            <span className={css.assistantToolCallText}>
              <span className={css.assistantToolCallName}>
                {call.toolName ?? t('details.toolCall')}
              </span>
              {call.content !== '' && (
                <span className={css.assistantToolCallArgs}>{call.content}</span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * Render one Markdown-capable record from its recorded source blocks and content.
 * @param props - Record data, render mode, controlled thinking state, call navigation, images, and labels.
 * @returns Rendered Markdown or raw source content with attachments and tool calls.
 */
export function TrajectoryMarkdownContent({
  cell,
  rendered,
  preview = false,
  thinkingExpanded,
  onThinkingExpandedChange,
  onOpenCall,
  renderImages,
  t,
}: {
  cell: TrajectoryCellProps
  rendered: boolean
  preview?: boolean
  thinkingExpanded: boolean
  onThinkingExpandedChange: (expanded: boolean) => void
  onOpenCall: (callId: string) => void
  renderImages: RenderMessageImages
  t: TrajectoryTranslate
}) {
  if (!rendered && cell.sourceBlocks && cell.sourceBlocks.length > 0) {
    return (
      <SourceBlocks
        blocks={cell.sourceBlocks}
        onOpenCall={onOpenCall}
        t={t}
      />
    )
  }
  if (cell.thinkingDetail) {
    if (!rendered) {
      const source = [
        cell.thinkingDetail,
        cell.outputDetail,
      ].filter((value): value is string => value !== undefined && value !== '').join('\n\n')
      return <MarkdownFragment text={source} rendered={false} preview={preview} t={t} />
    }
    return (
      <div className={`${css.assistantContent} ${css.assistantContentRendered}`}>
        <div className={
          preview && !cell.outputDetail
            ? `${css.thinkingQuote} ${css.thinkingQuoteOnlyPreview}`
            : css.thinkingQuote
        }
        >
          <button
            type="button"
            className={css.thinkingToggle}
            aria-expanded={thinkingExpanded}
            onClick={() => { onThinkingExpandedChange(!thinkingExpanded) }}
          >
            {t('record.thinking')}
            <IconChevronRightOutline14 className={css.thinkingChevron} size={12} />
          </button>
          {thinkingExpanded && (
            <MarkdownFragment
              text={cell.thinkingDetail}
              rendered={rendered}
              preview={preview}
              variant="compact"
              t={t}
            />
          )}
        </div>
        {cell.outputDetail && (
          <div className={css.assistantOutput}>
            <MarkdownFragment
              text={cell.outputDetail}
              rendered={rendered}
              preview={preview}
              t={t}
            />
          </div>
        )}
        <AssistantToolCalls
          blocks={cell.sourceBlocks}
          preview={preview}
          onOpenCall={onOpenCall}
          t={t}
        />
        <RecordAttachments
          blocks={cell.sourceBlocks}
          preview={preview}
          renderImages={renderImages}
          t={t}
        />
      </div>
    )
  }
  const source = markdownSource(cell)
  const hasAttachments = cell.sourceBlocks?.some(block => block.attachment !== undefined || block.file !== undefined) === true
  const hasToolCalls = cell.kind === 'message'
    && cell.sourceBlocks?.some(block => block.type === 'tool-call') === true
  if (!source && !hasAttachments && !hasToolCalls) {
    const emptyLabel = isToolCallOnly(cell, t)
      ? t('record.toolCallOnly')
      : cell.text || t('record.noContent')
    return <p className={css.noPayload}>{emptyLabel}</p>
  }
  if (!rendered || (!hasAttachments && !hasToolCalls)) {
    return <MarkdownFragment text={source ?? ''} rendered={rendered} preview={preview} t={t} />
  }
  return (
    <div>
      {source && <MarkdownFragment text={source} rendered preview={preview} t={t} />}
      {cell.kind === 'message' && (
        <AssistantToolCalls
          blocks={cell.sourceBlocks}
          preview={preview}
          onOpenCall={onOpenCall}
          t={t}
        />
      )}
      <RecordAttachments blocks={cell.sourceBlocks} preview={preview} renderImages={renderImages} t={t} />
    </div>
  )
}
