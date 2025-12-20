/**
 * 设置相关状态切片
 */
import { StateCreator } from 'zustand'
import { SECURITY_DEFAULTS } from '../../../shared/constants'

export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'groq' | 'mistral' | 'ollama' | 'custom'

export interface LLMConfig {
  provider: ProviderType
  model: string
  apiKey: string
  baseUrl?: string
  timeout?: number
  maxTokens?: number
  // Thinking 模式配置
  thinkingEnabled?: boolean
  thinkingBudget?: number  // thinking token 预算 (默认 16000)
}

export interface AutoApproveSettings {
  terminal: boolean    // 终端命令（run_command）
  dangerous: boolean   // 危险操作（delete_file_or_folder）
}

export interface ProviderModelConfig {
  customModels: string[]
}

export interface SecuritySettings {
  enablePermissionConfirm: boolean
  enableAuditLog: boolean
  strictWorkspaceMode: boolean
  allowedShellCommands?: string[]
  showSecurityWarnings?: boolean
}

export interface SettingsSlice {
  llmConfig: LLMConfig
  language: 'en' | 'zh'
  autoApprove: AutoApproveSettings
  promptTemplateId: string
  providerConfigs: Record<string, ProviderModelConfig>
  securitySettings: SecuritySettings
  onboardingCompleted: boolean
  hasExistingConfig: boolean

  setLLMConfig: (config: Partial<LLMConfig>) => void
  setLanguage: (lang: 'en' | 'zh') => void
  setAutoApprove: (settings: Partial<AutoApproveSettings>) => void
  setPromptTemplateId: (id: string) => void
  setProviderConfig: (providerId: string, config: ProviderModelConfig) => void
  addCustomModel: (providerId: string, model: string) => void
  removeCustomModel: (providerId: string, model: string) => void
  setSecuritySettings: (settings: Partial<SecuritySettings>) => void
  setOnboardingCompleted: (completed: boolean) => void
  setHasExistingConfig: (hasConfig: boolean) => void
  loadSettings: (isEmptyWindow?: boolean) => Promise<void>
}

const defaultLLMConfig: LLMConfig = {
  provider: 'openai',
  model: 'gpt-4o',
  apiKey: '',
  baseUrl: '',
  thinkingEnabled: false,
  thinkingBudget: 16000,
}

const defaultAutoApprove: AutoApproveSettings = {
  terminal: false,
  dangerous: false,
}

const defaultProviderConfigs: Record<string, ProviderModelConfig> = {
  openai: { customModels: [] },
  anthropic: { customModels: [] },
  gemini: { customModels: [] },
  deepseek: { customModels: [] },
  groq: { customModels: [] },
  mistral: { customModels: [] },
  ollama: { customModels: [] },
  custom: { customModels: [] },
}

// 使用共享常量作为默认安全设置
const defaultSecuritySettings: SecuritySettings = {
  enablePermissionConfirm: true,
  enableAuditLog: true,
  strictWorkspaceMode: true,
  allowedShellCommands: [...SECURITY_DEFAULTS.SHELL_COMMANDS],
  showSecurityWarnings: true,
}

export const createSettingsSlice: StateCreator<SettingsSlice, [], [], SettingsSlice> = (set, get) => ({
  llmConfig: defaultLLMConfig,
  language: 'en',
  autoApprove: defaultAutoApprove,
  promptTemplateId: 'default',
  providerConfigs: defaultProviderConfigs,
  securitySettings: defaultSecuritySettings,
  onboardingCompleted: true, // 默认 true，加载后更新
  hasExistingConfig: true,

  setLLMConfig: (config) =>
    set((state) => ({
      llmConfig: { ...state.llmConfig, ...config },
    })),

  setLanguage: (lang) => set({ language: lang }),

  setAutoApprove: (settings) =>
    set((state) => ({
      autoApprove: { ...state.autoApprove, ...settings },
    })),

  setPromptTemplateId: (id) => set({ promptTemplateId: id }),

  setProviderConfig: (providerId, config) =>
    set((state) => ({
      providerConfigs: {
        ...state.providerConfigs,
        [providerId]: config,
      },
    })),

  addCustomModel: (providerId, model) =>
    set((state) => {
      const current = state.providerConfigs[providerId] || { customModels: [] }
      if (current.customModels.includes(model)) return state
      return {
        providerConfigs: {
          ...state.providerConfigs,
          [providerId]: {
            ...current,
            customModels: [...current.customModels, model],
          },
        },
      }
    }),

  removeCustomModel: (providerId, model) =>
    set((state) => {
      const current = state.providerConfigs[providerId] || { customModels: [] }
      return {
        providerConfigs: {
          ...state.providerConfigs,
          [providerId]: {
            ...current,
            customModels: current.customModels.filter((m) => m !== model),
          },
        },
      }
    }),

  setSecuritySettings: (settings) =>
    set((state) => ({
      securitySettings: { ...state.securitySettings, ...settings },
    })),

  setOnboardingCompleted: (completed) => set({ onboardingCompleted: completed }),
  setHasExistingConfig: (hasConfig) => set({ hasExistingConfig: hasConfig }),

  loadSettings: async (isEmptyWindow = false) => {
    try {
      const settings = await window.electronAPI.getSetting('app-settings') as any
      if (settings) {
        set({
          llmConfig: settings.llmConfig || defaultLLMConfig,
          language: settings.language || 'en',
          autoApprove: settings.autoApprove || defaultAutoApprove,
          onboardingCompleted: settings.onboardingCompleted ?? true,
          hasExistingConfig: !!settings.llmConfig?.apiKey,
        })
      } else {
        set({ onboardingCompleted: false, hasExistingConfig: false })
      }

      if (!isEmptyWindow) {
        const workspace = await window.electronAPI.restoreWorkspace()
        if (workspace) {
          // 这里需要访问 FileSlice 的方法，但 Slices 模式下可以通过 get() 访问
          ; (get() as any).setWorkspace(workspace)
        }
      }
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  },
})
