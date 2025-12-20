/**
 * 主题系统配置
 * 支持内置主题和自定义主题
 * 使用 RGB 格式以支持 Tailwind 透明度修饰符
 */

export interface ThemeColors {
  // 背景色 (RGB 格式: "r g b")
  background: string
  backgroundSecondary: string
  surface: string
  surfaceHover: string
  surfaceActive: string

  // 文字色
  textPrimary: string
  textSecondary: string
  textMuted: string

  // 边框色
  borderSubtle: string
  borderStrong: string

  // 强调色
  accent: string
  accentHover: string
  accentMuted: string

  // 状态色
  statusSuccess: string
  statusWarning: string
  statusError: string
  statusInfo: string
}

export interface Theme {
  id: string
  name: string
  type: 'dark' | 'light'
  colors: ThemeColors
  monacoTheme: string
}

// 辅助函数：将 HEX 转换为 RGB 格式 "r g b"
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '0 0 0'
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`
}

// 内置主题 (使用 RGB 格式)
export const builtinThemes: Theme[] = [
  {
    id: 'adnify-dark',
    name: 'Adnify Dark',
    type: 'dark',
    monacoTheme: 'vs-dark',
    colors: {
      background: '9 9 11',
      backgroundSecondary: '24 24 27',
      surface: '24 24 27',
      surfaceHover: '39 39 42',
      surfaceActive: '63 63 70',
      textPrimary: '244 244 245',
      textSecondary: '161 161 170',
      textMuted: '113 113 122',
      borderSubtle: '39 39 42',
      borderStrong: '63 63 70',
      accent: '139 92 246',
      accentHover: '124 58 237',
      accentMuted: '139 92 246',
      statusSuccess: '34 197 94',
      statusWarning: '234 179 8',
      statusError: '239 68 68',
      statusInfo: '59 130 246',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    type: 'dark',
    monacoTheme: 'vs-dark',
    colors: {
      background: '2 6 23',
      backgroundSecondary: '15 23 42',
      surface: '15 23 42',
      surfaceHover: '30 41 59',
      surfaceActive: '51 65 85',
      textPrimary: '248 250 252',
      textSecondary: '148 163 184',
      textMuted: '100 116 139',
      borderSubtle: '15 23 42',
      borderStrong: '30 41 59',
      accent: '56 189 248',
      accentHover: '14 165 233',
      accentMuted: '56 189 248',
      statusSuccess: '34 197 94',
      statusWarning: '234 179 8',
      statusError: '239 68 68',
      statusInfo: '59 130 246',
    },
  },
  {
    id: 'dawn',
    name: 'Dawn',
    type: 'light',
    monacoTheme: 'vs',
    colors: {
      background: '255 255 255',
      backgroundSecondary: '248 250 252',
      surface: '255 255 255',
      surfaceHover: '241 245 249',
      surfaceActive: '226 232 240',
      textPrimary: '15 23 42',
      textSecondary: '71 85 105',
      textMuted: '148 163 184',
      borderSubtle: '241 245 249',
      borderStrong: '226 232 240',
      accent: '79 70 229',
      accentHover: '67 56 202',
      accentMuted: '79 70 229',
      statusSuccess: '22 163 74',
      statusWarning: '202 138 4',
      statusError: '220 38 38',
      statusInfo: '37 99 235',
    },
  },
]

// 主题管理器
class ThemeManager {
  private currentTheme: Theme = builtinThemes[0]
  private customThemes: Theme[] = []
  private listeners: Set<(theme: Theme) => void> = new Set()
  private initialized = false

  constructor() {
    // 不在构造函数中加载，等待 init() 调用
  }

  async loadFromConfig() {
    try {
      const savedThemeId = await window.electronAPI.getSetting('themeId')
      const savedCustomThemes = await window.electronAPI.getSetting('customThemes')

      if (savedCustomThemes && Array.isArray(savedCustomThemes)) {
        this.customThemes = savedCustomThemes as Theme[]
      }

      if (savedThemeId && typeof savedThemeId === 'string') {
        const theme = this.getThemeById(savedThemeId)
        if (theme) {
          this.currentTheme = theme
        }
      }
    } catch (e) {
      console.error('Failed to load theme from config:', e)
    }
  }

  private saveToConfig() {
    try {
      window.electronAPI.setSetting('themeId', this.currentTheme.id)
      window.electronAPI.setSetting('customThemes', this.customThemes)
    } catch (e) {
      console.error('Failed to save theme to config:', e)
    }
  }

  getAllThemes(): Theme[] {
    return [...builtinThemes, ...this.customThemes]
  }

  getThemeById(id: string): Theme | undefined {
    return this.getAllThemes().find(t => t.id === id)
  }

  getCurrentTheme(): Theme {
    return this.currentTheme
  }

  setTheme(themeId: string) {
    const theme = this.getThemeById(themeId)
    if (theme) {
      this.currentTheme = theme
      this.applyTheme(theme)
      this.saveToConfig()
      this.notifyListeners()
    }
  }

  addCustomTheme(theme: Theme) {
    if (this.getThemeById(theme.id)) {
      theme.id = `${theme.id}-${Date.now()}`
    }
    this.customThemes.push(theme)
    this.saveToConfig()
  }

  removeCustomTheme(themeId: string) {
    this.customThemes = this.customThemes.filter(t => t.id !== themeId)
    if (this.currentTheme.id === themeId) {
      this.setTheme('adnify-dark')
    }
    this.saveToConfig()
  }

  applyTheme(theme: Theme) {
    const root = document.documentElement
    const colors = theme.colors

    // 设置 CSS 变量 (RGB 格式)
    root.style.setProperty('--color-background', colors.background)
    root.style.setProperty('--color-background-secondary', colors.backgroundSecondary)
    root.style.setProperty('--color-surface', colors.surface)
    root.style.setProperty('--color-surface-hover', colors.surfaceHover)
    root.style.setProperty('--color-surface-active', colors.surfaceActive)
    root.style.setProperty('--color-text-primary', colors.textPrimary)
    root.style.setProperty('--color-text-secondary', colors.textSecondary)
    root.style.setProperty('--color-text-muted', colors.textMuted)
    root.style.setProperty('--color-border-subtle', colors.borderSubtle)
    root.style.setProperty('--color-border-strong', colors.borderStrong)
    root.style.setProperty('--color-accent', colors.accent)
    root.style.setProperty('--color-accent-hover', colors.accentHover)
    root.style.setProperty('--color-accent-muted', colors.accentMuted)
    root.style.setProperty('--color-status-success', colors.statusSuccess)
    root.style.setProperty('--color-status-warning', colors.statusWarning)
    root.style.setProperty('--color-status-error', colors.statusError)
    root.style.setProperty('--color-status-info', colors.statusInfo)

    // 设置主题类型
    root.setAttribute('data-theme', theme.type)

    // 更新 color-scheme
    root.style.colorScheme = theme.type

    console.log('[Theme] Applied theme:', theme.name)
  }

  subscribe(callback: (theme: Theme) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  private notifyListeners() {
    this.listeners.forEach(cb => cb(this.currentTheme))
  }

  async init() {
    if (this.initialized) return
    await this.loadFromConfig()
    this.applyTheme(this.currentTheme)
    this.initialized = true
  }
}

export const themeManager = new ThemeManager()

// 导出辅助函数
export { hexToRgb }
