/** `settings.theme` namespace dictionaries (the Appearance and font-size rows' copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'appearance.title': '外观',
  'appearance.light': '浅色',
  'appearance.dark': '深色',
  'appearance.system': '跟随系统',
  'customization.title': 'Arden 个性化',
  'customization.accent': '强调色',
  'customization.graphite': '石墨',
  'customization.sage': '鼠尾草',
  'customization.terracotta': '陶土',
  'customization.plum': '梅紫',
  'customization.density': '界面密度',
  'customization.comfortable': '舒适',
  'customization.compact': '紧凑',
  'customization.contextPanel': '首页辅助信息',
  'customization.contextPanel.description': '在宽屏首页显示工作区、模型与最近活动',
  'fontSize.title': '字号大小',
  'fontSize.description': '仅影响会话内容的字号',
  'fontSize.unit': 'px',
  'fontSize.increase': '增大字号',
  'fontSize.decrease': '减小字号',
} satisfies Record<string, string>

/** The settings.theme namespace key union. */
export type ThemeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'appearance.title': 'Appearance',
  'appearance.light': 'Light',
  'appearance.dark': 'Dark',
  'appearance.system': 'System',
  'customization.title': 'Personalize Arden',
  'customization.accent': 'Accent',
  'customization.graphite': 'Graphite',
  'customization.sage': 'Sage',
  'customization.terracotta': 'Terracotta',
  'customization.plum': 'Plum',
  'customization.density': 'Interface density',
  'customization.comfortable': 'Comfortable',
  'customization.compact': 'Compact',
  'customization.contextPanel': 'Home context panel',
  'customization.contextPanel.description': 'Show workspace, model, and recent activity on wide screens',
  'fontSize.title': 'Font size',
  'fontSize.description': 'Only affects conversation content',
  'fontSize.unit': 'px',
  'fontSize.increase': 'Increase font size',
  'fontSize.decrease': 'Decrease font size',
} satisfies Record<ThemeKey, string>
