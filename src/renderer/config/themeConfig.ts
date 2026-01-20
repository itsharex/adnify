/**
 * 主题系统配置
 * 支持内置主题和自定义主题
 * 使用 RGB 格式以支持 Tailwind 透明度修饰符
 */

import { api } from '@/renderer/services/electronAPI'
import { logger } from '@utils/Logger'

export interface ThemeColors {
  // 背景色 (RGB 格式: "r g b")
  background: string
  backgroundSecondary: string
  backgroundTertiary: string
  
  // 表面色
  surface: string
  surfaceHover: string
  surfaceActive: string
  surfaceMuted: string

  // 文字色
  textPrimary: string
  textSecondary: string
  textMuted: string
  textInverted: string

  // 边框色
  border: string
  borderSubtle: string
  borderActive: string

  // 强调色
  accent: string
  accentHover: string
  accentActive: string
  accentForeground: string
  accentSubtle: string

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
      // 背景：极深灰带微弱紫调，更有质感
      background: '18 18 21',         // #121215
      backgroundSecondary: '25 25 29', // #19191D (侧边栏/面板)
      backgroundTertiary: '32 32 37',  // #202025 (输入框/卡片背景)
      
      // 表面：提升层次感
      surface: '25 25 29',
      surfaceHover: '38 38 44',
      surfaceActive: '45 45 52',
      surfaceMuted: '63 63 70',

      // 文字：非纯白，更柔和
      textPrimary: '242 242 247',     // 接近纯白但不刺眼
      textSecondary: '161 161 180',   // 带冷紫调的灰色
      textMuted: '100 100 115',
      textInverted: '18 18 21',

      // 边框：极其细腻的微弱分割
      border: '40 40 48',             // 融合度更高的边框
      borderSubtle: '32 32 37',
      borderActive: '82 82 100',

      // 强调色：高级灰紫 (Desaturated Lavender)
      accent: '139 92 246',          // Violet 500 (作为基准，看起来更舒服)
      accentHover: '124 58 237',     // Violet 600
      accentActive: '109 40 217',    // Violet 700
      accentForeground: '255 255 255',
      accentSubtle: '167 139 250',   // Violet 400 (用于微光效果)

      statusSuccess: '52 211 153',    // Emerald 400 (更清新的绿)
      statusWarning: '251 191 36',    // Amber 400
      statusError: '248 113 113',     // Red 400 (不刺眼的红)
      statusInfo: '96 165 250',       // Blue 400
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    type: 'dark',
    monacoTheme: 'vs-dark',
    colors: {
      background: '2 6 23',           // Slate 950
      backgroundSecondary: '15 23 42', // Slate 900
      backgroundTertiary: '30 41 59',  // Slate 800
      
      surface: '15 23 42',
      surfaceHover: '30 41 59',
      surfaceActive: '51 65 85',
      surfaceMuted: '71 85 105',

      textPrimary: '248 250 252',
      textSecondary: '148 163 184',
      textMuted: '100 116 139',
      textInverted: '0 0 0',

      border: '30 41 59',
      borderSubtle: '15 23 42',       // Fixed: should be dark, not white
      borderActive: '71 85 105',

      accent: '56 189 248',          // Sky 400
      accentHover: '14 165 233',     // Sky 500
      accentActive: '2 132 199',     // Sky 600
      accentForeground: '0 0 0',
      accentSubtle: '125 211 252',   // Sky 300

      statusSuccess: '34 197 94',
      statusWarning: '234 179 8',
      statusError: '239 68 68',
      statusInfo: '59 130 246',
    },
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    type: 'dark',
    monacoTheme: 'vs-dark',
    colors: {
      background: '10 10 15',         // Dark Navy
      backgroundSecondary: '20 20 35',
      backgroundTertiary: '30 30 45',

      surface: '20 20 35',
      surfaceHover: '40 40 60',
      surfaceActive: '60 60 80',
      surfaceMuted: '80 80 100',

      textPrimary: '255 255 255',
      textSecondary: '200 200 255',
      textMuted: '150 150 200',
      textInverted: '0 0 0',

      border: '60 60 80',
      borderSubtle: '30 30 45',       // Fixed: subtle border should be dark
      borderActive: '100 100 120',    // Fixed: brighter for active state

      accent: '255 0 128',            // Neon Pink
      accentHover: '255 50 150',
      accentActive: '200 0 100',
      accentForeground: '255 255 255',
      accentSubtle: '255 100 200',

      statusSuccess: '0 255 100',     // Neon Green
      statusWarning: '255 200 0',     // Neon Yellow
      statusError: '255 50 50',       // Neon Red
      statusInfo: '0 200 255',        // Neon Blue
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
      backgroundTertiary: '241 245 249',

      surface: '255 255 255',
      surfaceHover: '241 245 249',
      surfaceActive: '226 232 240',
      surfaceMuted: '203 213 225',

      textPrimary: '15 23 42',
      textSecondary: '71 85 105',
      textMuted: '148 163 184',
      textInverted: '255 255 255',

      border: '226 232 240',
      borderSubtle: '241 245 249',    // Fixed: should be light gray, not dark
      borderActive: '203 213 225',

      accent: '79 70 229',
      accentHover: '67 56 202',
      accentActive: '55 48 163',
      accentForeground: '255 255 255',
      accentSubtle: '129 140 248',

      statusSuccess: '22 163 74',
      statusWarning: '202 138 4',
      statusError: '220 38 38',
      statusInfo: '37 99 235',
    },
  },
]

// 主题管理器
const LOCAL_STORAGE_THEME_KEY = 'adnify-theme-id'
const LOCAL_STORAGE_CUSTOM_THEMES_KEY = 'adnify-custom-themes'

class ThemeManager {
  private currentTheme: Theme = builtinThemes[0]
  private customThemes: Theme[] = []
  private listeners: Set<(theme: Theme) => void> = new Set()
  private initialized = false

  constructor() {
    // 从 localStorage 快速恢复主题（同步，避免闪烁）
    try {
      const savedThemeId = localStorage.getItem(LOCAL_STORAGE_THEME_KEY)
      const savedCustomThemes = localStorage.getItem(LOCAL_STORAGE_CUSTOM_THEMES_KEY)
      
      if (savedCustomThemes) {
        this.customThemes = JSON.parse(savedCustomThemes)
      }
      
      if (savedThemeId) {
        const theme = this.getThemeById(savedThemeId)
        if (theme) {
          this.currentTheme = theme
          // 立即应用主题（避免白屏）
          this.applyTheme(theme)
        }
      }
    } catch (e) {
      // 忽略 localStorage 错误
    }
  }

  async loadFromConfig() {
    try {
      // 并行读取主题配置
      const [savedThemeId, savedCustomThemes] = await Promise.all([
        api.settings.get('themeId'),
        api.settings.get('customThemes'),
      ])

      if (savedCustomThemes && Array.isArray(savedCustomThemes)) {
        this.customThemes = savedCustomThemes as Theme[]
        localStorage.setItem(LOCAL_STORAGE_CUSTOM_THEMES_KEY, JSON.stringify(savedCustomThemes))
      }

      if (savedThemeId && typeof savedThemeId === 'string') {
        const theme = this.getThemeById(savedThemeId)
        if (theme) {
          this.currentTheme = theme
          localStorage.setItem(LOCAL_STORAGE_THEME_KEY, savedThemeId)
        }
      }
    } catch (e) {
      logger.settings.error('Failed to load theme from config:', e)
    }
  }

  private saveToConfig() {
    // 同步写入 localStorage
    try {
      localStorage.setItem(LOCAL_STORAGE_THEME_KEY, this.currentTheme.id)
      localStorage.setItem(LOCAL_STORAGE_CUSTOM_THEMES_KEY, JSON.stringify(this.customThemes))
    } catch (e) {
      // 忽略 localStorage 错误
    }
    // 异步写入文件
    try {
      api.settings.set('themeId', this.currentTheme.id)
      api.settings.set('customThemes', this.customThemes)
    } catch (e) {
      logger.settings.error('Failed to save theme to config:', e)
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

    // 设置 CSS 变量 (RGB 格式) - 修复变量名以匹配 Tailwind Config
    root.style.setProperty('--background', colors.background)
    root.style.setProperty('--background-secondary', colors.backgroundSecondary)
    root.style.setProperty('--background-tertiary', colors.backgroundTertiary)
    
    root.style.setProperty('--surface', colors.surface)
    root.style.setProperty('--surface-hover', colors.surfaceHover)
    root.style.setProperty('--surface-active', colors.surfaceActive)
    root.style.setProperty('--surface-muted', colors.surfaceMuted)
    
    root.style.setProperty('--text-primary', colors.textPrimary)
    root.style.setProperty('--text-secondary', colors.textSecondary)
    root.style.setProperty('--text-muted', colors.textMuted)
    root.style.setProperty('--text-inverted', colors.textInverted)
    
    root.style.setProperty('--border', colors.border)
    root.style.setProperty('--border-subtle', colors.borderSubtle)
    root.style.setProperty('--border-active', colors.borderActive)
    
    root.style.setProperty('--accent', colors.accent)
    root.style.setProperty('--accent-hover', colors.accentHover)
    root.style.setProperty('--accent-active', colors.accentActive)
    root.style.setProperty('--accent-foreground', colors.accentForeground)
    root.style.setProperty('--accent-subtle', colors.accentSubtle)
    
    root.style.setProperty('--status-success', colors.statusSuccess)
    root.style.setProperty('--status-warning', colors.statusWarning)
    root.style.setProperty('--status-error', colors.statusError)
    root.style.setProperty('--status-info', colors.statusInfo)

    // 设置主题类型
    root.setAttribute('data-theme', theme.type)

    // 更新 color-scheme
    root.style.colorScheme = theme.type

    logger.settings.info('[Theme] Applied theme:', theme.name)
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
