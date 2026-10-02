/**
 * Appearance preference row registered into the General section item slot
 * (figma 501:30012 'Frame 2117131228'): title + three preference cubes.
 * Registered by this package — the theme feature owns its own settings
 * surface. Selection follows the persisted preference, never the resolved
 * active theme.
 */
import clsx from 'clsx'
import {
  IconDarkOutline16, IconFollowsystemOutline16, IconLightOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import {
  ARDEN_ACCENTS, ARDEN_DENSITIES,
  type ArdenAccent, type ArdenDensity, type ThemePreference,
} from '../theme-settings.ts'
import type { ThemeKey } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createAppearanceRowStore } from './settings-store.ts'
import css from './AppearanceRow.module.css'

/** Injected business face: the preference write (t rides the standard locale seat). */
export interface AppearanceRowInjected {
  /** Switch the theme preference. */
  setTheme: (id: ThemePreference) => void
  /** Change the Arden emphasis palette. */
  setAccent: (accent: ArdenAccent) => void
  /** Change the application spacing density. */
  setDensity: (density: ArdenDensity) => void
  /** Show or hide the wide-screen home context panel. */
  setShowContextPanel: (show: boolean) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type AppearanceRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createAppearanceRowStore>>
  & PropsLocale<'settings.theme'> & AppearanceRowInjected

/** Cube order and icons (figma 501:30015-30017: Light, Dark, System). */
const CUBES: readonly { id: ThemePreference; labelKey: ThemeKey; Icon: typeof IconLightOutline16 }[] = [
  { id: 'light', labelKey: 'appearance.light', Icon: IconLightOutline16 },
  { id: 'dark', labelKey: 'appearance.dark', Icon: IconDarkOutline16 },
  { id: 'system', labelKey: 'appearance.system', Icon: IconFollowsystemOutline16 },
]

/**
 * Render the Appearance row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function AppearanceRow({
  t, setTheme, setAccent, setDensity, setShowContextPanel, useStore,
}: AppearanceRowComponentProps) {
  const state = useStore(s => s)
  return (
    <div className={css.group}>
      <div className={css.title}>{t('appearance.title')}</div>
      <div className={css.cubeRow}>
        {CUBES.map(({ id, labelKey, Icon }) => (
          <button
            key={id}
            type="button"
            className={clsx(css.themeCube, state.preference === id && css.selected)}
            aria-pressed={state.preference === id}
            onClick={() => { setTheme(id) }}
          >
            <Icon />
            {t(labelKey)}
          </button>
        ))}
      </div>
      <div className={css.customization}>
        <div className={css.title}>{t('customization.title')}</div>
        <div className={css.optionLabel}>{t('customization.accent')}</div>
        <div className={css.accentRow}>
          {ARDEN_ACCENTS.map(accent => (
            <button
              key={accent}
              type="button"
              className={css.accentButton}
              data-accent={accent}
              aria-pressed={state.accent === accent}
              onClick={() => { setAccent(accent) }}
            >
              <span className={css.swatch} />
              {t(`customization.${accent}`)}
            </button>
          ))}
        </div>
        <div className={css.optionLabel}>{t('customization.density')}</div>
        <div className={css.segmented}>
          {ARDEN_DENSITIES.map(density => (
            <button
              key={density}
              type="button"
              aria-pressed={state.density === density}
              onClick={() => { setDensity(density) }}
            >
              {t(`customization.${density}`)}
            </button>
          ))}
        </div>
        <label className={css.toggleRow}>
          <span><strong>{t('customization.contextPanel')}</strong><small>{t('customization.contextPanel.description')}</small></span>
          <input
            type="checkbox"
            checked={state.showContextPanel}
            onChange={(event) => { setShowContextPanel(event.currentTarget.checked) }}
          />
        </label>
      </div>
    </div>
  )
}
