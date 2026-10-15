/** Recorded PTC source and output presentation for the Trajectory inspector. */

import { useEffect, useId, useState } from 'react'
import {
  CodeBlock,
  IconCheckOutline16,
  IconCopyOutline16,
  IconWrapLinesOutline16,
  JsonTree,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { JsonTreeProps } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CodeProgram } from './code-program.ts'
import type { TrajectoryTranslate } from './locales.ts'
import { parseJsonContainer } from './trajectory-inspector-model.ts'
import { jsonTreeLabels } from './trajectory-presentation-labels.ts'
import { stateOf } from './trajectory-table-model.ts'
import type { TableRecord } from './trajectory-table-model.ts'
import { TrajectoryInspectorSection } from './TrajectoryInspectorSection.tsx'
import css from './TrajectoryTable.module.css'

function InspectorCopyButton({ text, label, t }: {
  text: string
  label: string
  t: TrajectoryTranslate
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const timer = setTimeout(() => { setState('idle') }, 1_500)
    return () => { clearTimeout(timer) }
  }, [state])
  const title = state === 'idle' ? label : t(state === 'copied' ? 'copied' : 'copy.failed')
  return (
    <button
      type="button"
      className={css.programAction}
      data-state={state}
      aria-label={title}
      title={title}
      onClick={() => { void writeClipboard(text).then((ok) => { setState(ok ? 'copied' : 'failed') }) }}
    >
      {state === 'copied' ? <IconCheckOutline16 size={12} /> : <IconCopyOutline16 size={12} />}
    </button>
  )
}

/**
 * Render recorded PTC source with wrapping, original-arguments, and copy controls.
 * @param props - Program data, wrapping state sampled when opened, optional detail action, and labels.
 * @returns A full source panel or a bounded inspector preview.
 */
export function TrajectoryProgramInput({
  program,
  initialWrapped,
  stringWrapping,
  onOpen,
  t,
}: {
  program: CodeProgram
  initialWrapped: boolean
  stringWrapping: JsonTreeProps['stringWrapping']
  onOpen?: () => void
  t: TrajectoryTranslate
}) {
  const contentsId = useId()
  const [wrapped, setWrapped] = useState(initialWrapped)
  const [showJson, setShowJson] = useState(false)
  const actions = (
    <span className={css.programActions}>
      {!showJson && program.language !== undefined && (
        <span className={css.programLanguage}>{program.language}</span>
      )}
      {!showJson && (
        <button
          type="button"
          className={css.programAction}
          aria-label={t('record.wrapLines')}
          title={t('record.wrapLines')}
          aria-pressed={wrapped}
          aria-controls={contentsId}
          onClick={() => {
            const next = !wrapped
            setWrapped(next)
            stringWrapping?.setDefault(next)
          }}
        >
          <IconWrapLinesOutline16 size={12} />
        </button>
      )}
      {onOpen === undefined && (
        <button
          type="button"
          className={css.programAction}
          aria-label={t('code.originalJson')}
          title={t('code.originalJson')}
          aria-pressed={showJson}
          aria-controls={contentsId}
          onClick={() => { setShowJson(value => !value) }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 2H5a2 2 0 0 0-2 2v2a2 2 0 0 1-2 2 2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h1" />
            <path d="M10 2h1a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0-2 2v2a2 2 0 0 1-2 2h-1" />
          </svg>
        </button>
      )}
      <InspectorCopyButton
        text={showJson ? program.rawInput : program.source}
        label={t(showJson ? 'copy.json' : 'code.copySource')}
        t={t}
      />
    </span>
  )
  const body = (
    <div id={contentsId} className={css.programContent} data-wrap={wrapped}>
      {showJson
        ? <JsonTree data={program.arguments} label={t('record.parametersJson')}
          labels={jsonTreeLabels(t)} stringWrapping={stringWrapping} />
        : <CodeBlock code={program.source} lang={program.language} lineNumbers showHeader={false}
          className={css.programSource} copyLabel={t('code.copySource')} copiedLabel={t('copied')} />}
    </div>
  )
  return onOpen === undefined
    ? (
      <section className={css.programPanel}>
        <header className={css.overviewHeading}>
          <span>{t('code.source')}</span>
          {actions}
        </header>
        {body}
      </section>
    )
    : (
      <TrajectoryInspectorSection label={t('code.source')} onOpen={onOpen} actions={actions}>
        {body}
      </TrajectoryInspectorSection>
    )
}

/**
 * Render recorded PTC output as JSON or verbatim text with copy controls.
 * @param props - Selected record, wrapping mode, optional detail action, and labels.
 * @returns A full output panel or a bounded inspector preview.
 */
export function TrajectoryProgramOutput({ record, stringWrapping, onOpen, t }: {
  record: TableRecord
  stringWrapping: JsonTreeProps['stringWrapping']
  onOpen?: () => void
  t: TrajectoryTranslate
}) {
  const output = record.cell.outputDetail
  const json = output === undefined || record.cell.isError === true ? undefined : parseJsonContainer(output)
  const actions = output === undefined ? undefined : (
    <span className={css.programActions}>
      <InspectorCopyButton text={output} label={t('code.copyOutput')} t={t} />
    </span>
  )
  const body = (
    <div className={css.programContent}>
      {output === undefined || output === ''
        ? <p className={css.noPayload}>{t(stateOf(record) === 'running' ? 'code.running' : 'record.noOutput')}</p>
        : json !== undefined
          ? <JsonTree data={json} label={t('record.outputJson')} labels={jsonTreeLabels(t)}
            stringWrapping={stringWrapping} collapsedStringLines={onOpen === undefined ? 12 : 3} />
          : <pre className={`${css.programOutput} ${record.cell.isError === true ? css.programError : ''}`}>{output}</pre>}
    </div>
  )
  return onOpen === undefined
    ? (
      <section className={css.programPanel}>
        <header className={css.overviewHeading}>
          <span>{t('code.output')}</span>
          {actions}
        </header>
        {body}
      </section>
    )
    : (
      <TrajectoryInspectorSection label={t('code.output')} onOpen={onOpen} actions={actions}>
        {body}
      </TrajectoryInspectorSection>
    )
}
