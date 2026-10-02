/** Host registration for the browser theme preference and pre-plugin palette. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import { bootThemeInjections } from './boot-theme.ts'
import {
  DEFAULT_ACCENT, DEFAULT_DENSITY, DEFAULT_FONT_SIZE, DEFAULT_PREFERENCE,
  DEFAULT_SHOW_CONTEXT_PANEL, THEME_SETTINGS_NAMESPACE, ThemeSettingsSchema,
  type ThemeSettings,
} from './theme-settings.ts'

export {
  ACCENT_FIELD, ARDEN_ACCENTS, ARDEN_DENSITIES, CONTEXT_PANEL_FIELD, DEFAULT_ACCENT,
  DEFAULT_DENSITY, DEFAULT_FONT_SIZE, DEFAULT_PREFERENCE, DEFAULT_SHOW_CONTEXT_PANEL,
  DENSITY_FIELD, FONT_SIZE_FIELD, FONT_SIZE_MAX, FONT_SIZE_MIN, THEME_PREFERENCE_FIELD,
  THEME_PREFERENCES, THEME_SETTINGS_NAMESPACE, type ArdenAccent, type ArdenDensity,
  type ThemePreference, type ThemeSettings,
} from './theme-settings.ts'

const THEME_NAMESPACE = THEME_SETTINGS_NAMESPACE

/** Read the registered theme section or the schema defaults without a settings provider. */
function readSection(ctx: Context): ThemeSettings {
  const fallback = {
    preference: DEFAULT_PREFERENCE, fontSize: DEFAULT_FONT_SIZE, accent: DEFAULT_ACCENT,
    density: DEFAULT_DENSITY, showContextPanel: DEFAULT_SHOW_CONTEXT_PANEL,
  }
  const settings = ctx.get('settings')
  if (settings === undefined) return fallback
  const section = settings.get(THEME_NAMESPACE) as ThemeSettings | undefined
  if (section === undefined) return fallback
  return section
}

/**
 * Register the durable theme section when the optional settings service is
 * composed, and answer every index injection collection with the current
 * theme bootstrap row.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(THEME_NAMESPACE, ThemeSettingsSchema)
  })
  ctx.on('webserver/index-inject', (table) => {
    const section = readSection(ctx)
    table.push(...bootThemeInjections(section.preference, section.fontSize))
  }, { prepend: true })
}
