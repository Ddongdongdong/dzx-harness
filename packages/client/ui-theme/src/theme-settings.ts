/** Theme preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Built-in preferences accepted at the registry and settings boundaries. */
export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const

/** Settings namespace owned by the theme plugin. */
export const THEME_SETTINGS_NAMESPACE = 'ui-theme'

/** Field carrying the selected built-in theme preference. */
export const THEME_PREFERENCE_FIELD = 'preference'

/** Field carrying the conversation content font size. */
export const FONT_SIZE_FIELD = 'fontSize'

/** Field carrying the Arden emphasis palette. */
export const ACCENT_FIELD = 'accent'
/** Field carrying the application spacing density. */
export const DENSITY_FIELD = 'density'
/** Field carrying the wide-screen context-panel visibility. */
export const CONTEXT_PANEL_FIELD = 'showContextPanel'

/** Arden accent palettes offered by the built-in customization row. */
export const ARDEN_ACCENTS = ['graphite', 'sage', 'terracotta', 'plum'] as const

/** Workspace density options offered by the built-in customization row. */
export const ARDEN_DENSITIES = ['comfortable', 'compact'] as const

/** Theme preference persisted by the product Appearance row. */
export type ThemePreference = typeof THEME_PREFERENCES[number]
/** Built-in Arden emphasis palette id. */
export type ArdenAccent = typeof ARDEN_ACCENTS[number]
/** Built-in Arden spacing-density id. */
export type ArdenDensity = typeof ARDEN_DENSITIES[number]

/** Default preference when the user-settings document has no override. */
export const DEFAULT_PREFERENCE: ThemePreference = 'system'

/** Smallest accepted content font size (px). */
export const FONT_SIZE_MIN = 12

/** Largest accepted content font size (px). */
export const FONT_SIZE_MAX = 17

/** Content font size when the user-settings document has no override (px). */
export const DEFAULT_FONT_SIZE = 14
/** Default Arden emphasis palette. */
export const DEFAULT_ACCENT: ArdenAccent = 'graphite'
/** Default application spacing density. */
export const DEFAULT_DENSITY: ArdenDensity = 'comfortable'
/** Default wide-screen context-panel visibility. */
export const DEFAULT_SHOW_CONTEXT_PANEL = true

/** Durable theme section shared by the Host schema and the browser scope. */
export interface ThemeSettings {
  /** Selected built-in preference. */
  preference: ThemePreference
  /** Conversation content font size in px (integer within {@link FONT_SIZE_MIN}..{@link FONT_SIZE_MAX}). */
  fontSize: number
  /** Arden emphasis palette. */
  accent: ArdenAccent
  /** Spacing density used by the application shell and home workspace. */
  density: ArdenDensity
  /** Whether the home workspace shows its auxiliary context panel on wide screens. */
  showContextPanel: boolean
}

/** Durable theme schema; also the wire envelope the browser scope validates against. */
export const ThemeSettingsSchema: z<ThemeSettings> = z.object({
  [THEME_PREFERENCE_FIELD]: z.union([...THEME_PREFERENCES]).default(DEFAULT_PREFERENCE),
  [FONT_SIZE_FIELD]: z.number().step(1).min(FONT_SIZE_MIN).max(FONT_SIZE_MAX).default(DEFAULT_FONT_SIZE),
  [ACCENT_FIELD]: z.union([...ARDEN_ACCENTS]).default(DEFAULT_ACCENT),
  [DENSITY_FIELD]: z.union([...ARDEN_DENSITIES]).default(DEFAULT_DENSITY),
  [CONTEXT_PANEL_FIELD]: z.boolean().default(DEFAULT_SHOW_CONTEXT_PANEL),
})

/**
 * Narrow one wire or registry value to a persistable preference.
 * @param value - value crossing the settings or registry boundary.
 * @returns whether the value is a built-in preference.
 */
export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.some(preference => preference === value)
}
