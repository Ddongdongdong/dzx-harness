/** Recorded source, payload, result, and schema presentation for the Trajectory inspector. */

import { JsonTree, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { JsonTreeProps } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RenderMessageImages } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TrajectoryTranslate } from './locales.ts'
import type { TrajectoryCellProps, TrajectorySourceBlock } from './trajectory-record.ts'
import { parseJsonContainer, parseToolSchema } from './trajectory-inspector-model.ts'
import { jsonTreeLabels, markdownLabels } from './trajectory-presentation-labels.ts'
import css from './TrajectoryTable.module.css'

/**
 * Render producer metadata recorded beside a user-role message.
 * @param props - Record data, JSON string wrapping mode, and localized labels.
 * @returns A JSON tree or the localized missing-source state.
 */
export function TrajectoryMessageSource({
  cell,
  stringWrapping,
  t,
}: {
  cell: TrajectoryCellProps
  stringWrapping: JsonTreeProps['stringWrapping']
  t: TrajectoryTranslate
}) {
  const source = cell.messageSource
  if (source === undefined) return <p className={css.noPayload}>{t('source.notRecorded')}</p>
  const data = typeof source === 'object' && source !== null
    ? source
    : { value: source }
  return (
    <JsonTree
      data={data}
      stringWrapping={stringWrapping}
      collapsedStringLines={12}
      label={t('source.messageJson')}
      labels={jsonTreeLabels(t)}
      className={css.jsonPayload}
    />
  )
}

function ToolOutputBlocks({
  blocks,
  error,
  errorDetail,
  preview,
  renderImages,
}: {
  blocks: readonly TrajectorySourceBlock[]
  error: boolean
  /** Failure name and code preserved beside image-only error content. */
  errorDetail?: string | undefined
  preview: boolean
  renderImages: RenderMessageImages
}) {
  return (
    <div className={[
      css.resultBlocks,
      preview ? css.resultBlocksPreview : undefined,
      error ? css.errorPayload : undefined,
    ].filter((value): value is string => value !== undefined).join(' ')}
    >
      {error && errorDetail !== undefined && errorDetail !== ''
        && <pre className={css.resultBlockText}>{errorDetail}</pre>}
      {blocks.map((block, index) => (
        block.attachment !== undefined
          ? (
            <div className={css.messageImages} key={index}>
              {renderImages({ images: [{ attachment: block.attachment }], align: 'start' })}
            </div>
          )
          : block.content !== ''
            ? <pre className={css.resultBlockText} key={index}>{block.content}</pre>
            : null
      ))}
    </div>
  )
}

/**
 * Render one record input or output using its recorded content representation.
 * @param props - Record data, direction, preview mode, image renderer, wrapping mode, and labels.
 * @returns Markdown, JSON, source blocks, plain text, or a localized empty state.
 */
export function TrajectoryRecordPayload({
  cell,
  direction,
  preview = false,
  renderImages,
  stringWrapping,
  t,
}: {
  cell: TrajectoryCellProps
  direction: 'input' | 'output'
  preview?: boolean
  renderImages: RenderMessageImages
  stringWrapping: JsonTreeProps['stringWrapping']
  t: TrajectoryTranslate
}) {
  const value = direction === 'input' ? cell.inputDetail : cell.outputDetail
  const missing = direction === 'input'
    ? t('record.noPayload')
    : t('record.noResult')
  if (!value) return <p className={css.noPayload}>{missing}</p>
  const error = direction === 'output' && cell.isError === true
  const payloadClass = preview ? css.jsonPreview : css.jsonPayload
  const payloadClassName = error ? `${payloadClass} ${css.errorPayload}` : payloadClass

  const json = parseJsonContainer(value)
  const singleTextResult = direction === 'output'
    && cell.outputBlocks?.length === 1
    && cell.outputBlocks[0]?.type === 'text'
  if (singleTextResult && json !== undefined) {
    return (
      <JsonTree
        data={json}
        stringWrapping={stringWrapping}
        collapsedStringLines={preview ? 3 : 12}
        label={t('record.resultJson')}
        labels={jsonTreeLabels(t)}
        className={payloadClassName}
      />
    )
  }

  if (
    direction === 'output'
    && cell.outputBlocks?.some(block =>
      block.attachment !== undefined || block.content !== '') === true
  ) {
    return (
      <ToolOutputBlocks
        blocks={cell.outputBlocks}
        error={error}
        errorDetail={error ? value : undefined}
        preview={preview}
        renderImages={renderImages}
      />
    )
  }

  const markdown = (
    direction === 'input'
    && (cell.kind === 'user' || cell.kind === 'context')
  ) || (
    direction === 'output' && cell.kind === 'message'
  )
  if (markdown) {
    return (
      <div className={[
        preview ? css.markdownPreview : css.markdownPayload,
        error ? css.errorPayload : undefined,
      ].filter((className): className is string => className !== undefined).join(' ')}
      >
        <MarkdownText text={value} labels={markdownLabels(t)} />
      </div>
    )
  }
  if (json !== undefined) {
    return (
      <JsonTree
        data={json}
        stringWrapping={stringWrapping}
        collapsedStringLines={preview ? 3 : 12}
        label={t(direction === 'input' ? 'record.payloadJson' : 'record.outputJson')}
        labels={jsonTreeLabels(t)}
        className={payloadClassName}
      />
    )
  }
  return (
    <pre className={[
      css.payload,
      preview ? css.payloadPreview : undefined,
      error ? css.errorPayload : undefined,
      value === t('record.noOutput') ? css.noOutputText : undefined,
    ].filter((className): className is string => className !== undefined).join(' ')}
    >
      {value}
    </pre>
  )
}

/**
 * Render a recorded tool schema as structured metadata when it is complete.
 * @param props - Record data, preview mode, JSON string wrapping mode, and labels.
 * @returns A structured schema, its raw value, or the localized missing state.
 */
export function TrajectoryRecordSchema({
  cell,
  preview = false,
  stringWrapping,
  t,
}: {
  cell: TrajectoryCellProps
  preview?: boolean
  stringWrapping: JsonTreeProps['stringWrapping']
  t: TrajectoryTranslate
}) {
  if (!cell.schemaDetail) {
    return <p className={css.noPayload}>{t('record.schemaUnavailable')}</p>
  }
  const schema = parseToolSchema(cell.schemaDetail)
  if (schema !== undefined) {
    return (
      <div className={preview ? `${css.schema} ${css.schemaPreview}` : css.schema}>
        <header className={css.schemaIntro}>
          <h3 className={css.schemaName}>{schema.name}</h3>
          <p className={css.schemaDescription}>{schema.description}</p>
        </header>
        <section className={css.schemaParameters}>
          <h4 className={css.schemaParametersTitle}>{t('record.parameters')}</h4>
          <JsonTree
            data={schema.parameters}
            stringWrapping={stringWrapping}
            collapsedStringLines={preview ? 3 : 12}
            label={t('record.namedParametersJson', { name: schema.name })}
            labels={jsonTreeLabels(t)}
            className={css.schemaTree}
          />
        </section>
      </div>
    )
  }
  return (
    <pre className={`${css.payload} ${preview ? css.payloadPreview : ''}`}>
      {cell.schemaDetail}
    </pre>
  )
}
