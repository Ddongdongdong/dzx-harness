import type { ReactNode, RefObject } from 'react'
import {
  ArdenMark, IconAgentPresetOutline16, IconChevronDownOutline14, IconCodeOutline16,
  IconFolderClose16, IconFolderOpen16, IconPlayOutline16, IconSearchOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { workspaceTitleOf } from '@deepseek-ai/dsh-util-workspace-path'
import type { ConversationContentProps } from '../contract/slots.ts'
import css from './HeroShell.module.css'

type HeroTranslate = ConversationContentProps['t']

/** Display-ready recent Session metadata derived from the live Session catalog. */
export interface HeroRecentSession {
  title: string
  running: boolean
}

/** Return a compact Workspace label for the hero. */
export function workspaceLabel(cwd: string): string {
  const base = workspaceTitleOf(cwd)
  return base !== '' ? base : cwd
}

/** Workspace selector shared by the hero and the live Workspace picker. */
export function WorkspaceChip({ buttonRef, label, menuOpen = false, onClick, t }: {
  buttonRef?: RefObject<HTMLButtonElement>
  label?: string | undefined
  menuOpen?: boolean
  onClick?: () => void
  t: HeroTranslate
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={css.workspace}
      aria-label={t('hero.chooseWorkspace')}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      onClick={onClick}
    >
      {label === undefined
        ? <IconFolderClose16 className={css.folder} size={16} />
        : <IconFolderOpen16 className={css.folder} size={16} />}
      <span className={css.workspaceLabel}>{label ?? t('hero.chooseWorkspace')}</span>
      <IconChevronDownOutline14 className={css.chevron} size={12} />
    </button>
  )
}

export interface HeroShellProps {
  t: HeroTranslate
  renderSlot: ConversationContentProps['renderSlot']
  workspaceTitle?: string | undefined
  workspacePath?: string | undefined
  recentSessions?: readonly HeroRecentSession[] | undefined
  onPromptSelect?: ((prompt: string) => void) | undefined
  children?: ReactNode
}

const ACTIONS = [
  { key: 'understand', icon: IconSearchOutline16 },
  { key: 'build', icon: IconCodeOutline16 },
  { key: 'run', icon: IconPlayOutline16 },
  { key: 'agents', icon: IconAgentPresetOutline16 },
] as const

const SUGGESTIONS = ['review', 'explain', 'plan'] as const

function ActionCards({ t, onPromptSelect }: Pick<HeroShellProps, 't' | 'onPromptSelect'>) {
  return (
    <div className={css.actionGrid}>
      {ACTIONS.map(({ key, icon: Icon }) => {
        const prompt = t(`hero.action.${key}.prompt`)
        return (
          <button
            key={key}
            type="button"
            className={css.actionCard}
            disabled={onPromptSelect === undefined}
            onClick={() => { onPromptSelect?.(prompt) }}
          >
            <span className={css.actionIcon}><Icon size={17} /></span>
            <span>
              <strong>{t(`hero.action.${key}.title`)}</strong>
              <small>{t(`hero.action.${key}.description`)}</small>
            </span>
            <span className={css.actionArrow} aria-hidden="true">→</span>
          </button>
        )
      })}
    </div>
  )
}

function SuggestedPrompts({ t, onPromptSelect }: Pick<HeroShellProps, 't' | 'onPromptSelect'>) {
  return (
    <section className={css.suggestions} aria-label={t('hero.suggestions')}>
      <span>{t('hero.suggestions')}</span>
      <div>
        {SUGGESTIONS.map(key => (
          <button
            key={key}
            type="button"
            disabled={onPromptSelect === undefined}
            onClick={() => { onPromptSelect?.(t(`hero.suggestion.${key}.prompt`)) }}
          >
            {t(`hero.suggestion.${key}`)}
          </button>
        ))}
      </div>
    </section>
  )
}

function RightPanel({ t, workspaceTitle, workspacePath, recentSessions = [] }:
Pick<HeroShellProps, 't' | 'workspaceTitle' | 'workspacePath' | 'recentSessions'>) {
  return (
    <aside className={css.aside} aria-label={t('hero.context.title')}>
      <section className={css.contextCard}>
        <span className={css.cardLabel}>{t('hero.workspace')}</span>
        <strong>{workspaceTitle ?? t('hero.noWorkspace')}</strong>
        {workspacePath !== undefined && <small title={workspacePath}>{workspacePath}</small>}
      </section>
      <section className={css.contextCard}>
        <span className={css.cardLabel}>{t('hero.model')}</span>
        <strong>{t('hero.model.current')}</strong>
        <small>{t('hero.model.hint')}</small>
      </section>
      <section className={css.contextCard}>
        <span className={css.cardLabel}>{t('hero.activity')}</span>
        {recentSessions.length === 0
          ? <small>{t('hero.activity.empty')}</small>
          : (
            <ul className={css.activityList}>
              {recentSessions.map((session, index) => (
                <li key={`${session.title}-${index}`}>
                  <span data-running={session.running || undefined} />
                  <span title={session.title}>{session.title}</span>
                </li>
              ))}
            </ul>
          )}
      </section>
    </aside>
  )
}

/** Arden blank-session workspace over the real resident composer. */
export function HeroShell({
  t, renderSlot, workspaceTitle, workspacePath, recentSessions = [], onPromptSelect, children,
}: HeroShellProps) {
  return (
    <div className={css.root}>
      <main className={css.main}>
        <div className={css.eyebrow}>
          {renderSlot('conversation.hero.brand.mark', { size: 20, className: css.heroMark }, {
            fallback: (
              <ArdenMark
                size={20}
                {...(css.heroMark === undefined ? {} : { className: css.heroMark })}
              />
            ),
          })}
          <span>{t('hero.brand')}</span>
        </div>
        <h1 data-testid="hero-headline">{t('hero.headline')}</h1>
        <p className={css.subtitle}>{t('hero.subtitle')}</p>

        <ActionCards t={t} onPromptSelect={onPromptSelect} />
        <SuggestedPrompts t={t} onPromptSelect={onPromptSelect} />
      </main>
      <RightPanel
        t={t}
        workspaceTitle={workspaceTitle}
        workspacePath={workspacePath}
        recentSessions={recentSessions}
      />
      {children}
    </div>
  )
}
