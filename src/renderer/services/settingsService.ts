/**
 * 统一设置服务
 * 集中管理所有应用设置的加载、保存和清理
 * 
 * 设计原则：
 * 1. 只保存用户修改过的配置，内置默认值不保存
 * 2. 内置 Provider 的 adapterConfig 不保存（代码已定义）
 * 3. 自定义 Provider 的完整配置需要保存
 * 4. editorSettings 已废弃，使用独立的 editorConfig
 */

import { logger } from '@utils/Logger'
import { LLM_DEFAULTS } from '@/shared/constants'
import { PROVIDERS, getAdapterConfig, getBuiltinAdapter, type LLMAdapterConfig } from '@/shared/config/providers'

// ============ 类型定义 ============

/** LLM 参数配置 */
export interface LLMParameters {
    temperature: number
    topP: number
    maxTokens: number
    frequencyPenalty?: number
    presencePenalty?: number
}

/** LLM 配置 */
export interface LLMConfig {
    provider: string
    model: string
    apiKey: string
    baseUrl?: string
    timeout?: number
    adapterId?: string
    adapterConfig?: LLMAdapterConfig
    parameters?: LLMParameters
    thinkingEnabled?: boolean
    thinkingBudget?: number
}

/** Provider 配置 - 只保存用户修改的部分 */
export interface ProviderConfig {
    apiKey?: string
    baseUrl?: string
    model?: string
    timeout?: number
    adapterId?: string
    adapterConfig?: LLMAdapterConfig  // 只有自定义 Provider 才保存
    customModels?: string[]
}

/** 自动审批设置 */
export interface AutoApproveSettings {
    terminal: boolean
    dangerous: boolean
}

/** Agent 配置 */
export interface AgentConfig {
    maxToolLoops: number
    maxHistoryMessages: number
    maxToolResultChars: number
    maxFileContentChars: number
    maxTotalContextChars: number
    enableAutoFix: boolean
    maxContextFiles: number
    maxSemanticResults: number
    maxTerminalChars: number
    maxSingleFileChars: number
}

/** 完整的应用设置（不再包含 editorSettings） */
export interface AppSettings {
    llmConfig: LLMConfig
    language: string
    autoApprove: AutoApproveSettings
    promptTemplateId?: string
    agentConfig: AgentConfig
    providerConfigs: Record<string, ProviderConfig>
    aiInstructions: string
    onboardingCompleted: boolean
}

// ============ 内置 Provider ID 列表 ============
const BUILTIN_PROVIDER_IDS = ['openai', 'anthropic', 'gemini', 'custom']

/** 判断是否为内置 Provider */
function isBuiltinProvider(providerId: string): boolean {
    return BUILTIN_PROVIDER_IDS.includes(providerId)
}

// ============ 默认值 ============

const defaultLLMParameters: LLMParameters = {
    temperature: LLM_DEFAULTS.TEMPERATURE,
    topP: LLM_DEFAULTS.TOP_P,
    maxTokens: LLM_DEFAULTS.MAX_TOKENS,
}

const defaultLLMConfig: LLMConfig = {
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: '',
    parameters: defaultLLMParameters,
}

const defaultAutoApprove: AutoApproveSettings = {
    terminal: false,
    dangerous: false,
}

const defaultAgentConfig: AgentConfig = {
    maxToolLoops: 30,
    maxHistoryMessages: 60,
    maxToolResultChars: 10000,
    maxFileContentChars: 15000,
    maxTotalContextChars: 60000,
    enableAutoFix: true,
    maxContextFiles: 6,
    maxSemanticResults: 5,
    maxTerminalChars: 3000,
    maxSingleFileChars: 6000,
}

// 生成所有内置 Provider 的默认配置（运行时使用，不保存）
const generateDefaultProviderConfigs = (): Record<string, ProviderConfig> => {
    const configs: Record<string, ProviderConfig> = {}
    for (const provider of Object.values(PROVIDERS)) {
        configs[provider.id] = {
            adapterId: provider.id,
            adapterConfig: provider.adapter,
            model: provider.models.recommended,
            baseUrl: provider.endpoint.default,
        }
    }
    return configs
}

// ============ 清理工具函数 ============

/** 判断 LLM 参数是否为默认值 */
function isDefaultParameters(params?: LLMParameters): boolean {
    if (!params) return true
    return (
        params.temperature === LLM_DEFAULTS.TEMPERATURE &&
        params.topP === LLM_DEFAULTS.TOP_P &&
        params.maxTokens === LLM_DEFAULTS.MAX_TOKENS &&
        !params.frequencyPenalty &&
        !params.presencePenalty
    )
}

/** 判断 baseUrl 是否为默认值 */
function isDefaultBaseUrl(providerId: string, baseUrl?: string): boolean {
    if (!baseUrl) return true
    const provider = PROVIDERS[providerId]
    return provider?.endpoint.default === baseUrl
}

/** 清理 LLM 配置 - 简化版：只保存 provider 和 model */
function cleanLLMConfig(config: LLMConfig): Partial<LLMConfig> {
    // llmConfig 只保存当前选中的 provider 和 model
    // 其他配置（apiKey、baseUrl、adapterConfig）保存在 providerConfigs 中
    return {
        provider: config.provider,
        model: config.model,
    }
}

/** 清理单个 Provider 配置 - 保存完整的 Provider 配置 */
function cleanProviderConfig(
    providerId: string,
    config: ProviderConfig,
    isCurrentProvider: boolean
): Partial<ProviderConfig> | null {
    const isBuiltin = isBuiltinProvider(providerId)
    const cleaned: Partial<ProviderConfig> = {}

    // apiKey 始终保存（如果有）
    if (config.apiKey) {
        cleaned.apiKey = config.apiKey
    }

    // baseUrl: 只保存非默认值
    if (config.baseUrl && !isDefaultBaseUrl(providerId, config.baseUrl)) {
        cleaned.baseUrl = config.baseUrl
    }

    // model: 当前 Provider 保存
    if (isCurrentProvider && config.model) {
        cleaned.model = config.model
    }

    // timeout: 只保存非默认值
    if (config.timeout && config.timeout !== 120000) {
        cleaned.timeout = config.timeout
    }

    // customModels: 只保存非空数组
    if (config.customModels && config.customModels.length > 0) {
        cleaned.customModels = config.customModels
    }

    // adapterId 和 adapterConfig: 
    // - 内置 Provider: 不保存 adapterConfig（代码已定义）
    // - 自定义 Provider: 保存完整配置
    if (!isBuiltin) {
        if (config.adapterId) {
            cleaned.adapterId = config.adapterId
        }
        if (config.adapterConfig) {
            cleaned.adapterConfig = config.adapterConfig
        }
    }

    // 如果清理后没有任何有意义的数据，返回 null
    if (Object.keys(cleaned).length === 0) {
        return null
    }

    return cleaned
}

/** 清理所有 Provider 配置 */
function cleanProviderConfigs(
    configs: Record<string, ProviderConfig>,
    currentProvider: string
): Record<string, ProviderConfig> {
    const cleaned: Record<string, ProviderConfig> = {}

    for (const [id, config] of Object.entries(configs)) {
        const isCurrentProvider = id === currentProvider
        const cleanedConfig = cleanProviderConfig(id, config, isCurrentProvider)

        if (cleanedConfig) {
            cleaned[id] = cleanedConfig as ProviderConfig
        }
    }

    return cleaned
}

// ============ 设置服务类 ============

class SettingsService {
    private cache: AppSettings | null = null

    /** 加载所有设置 */
    async loadAll(): Promise<AppSettings> {
        try {
            const settings = await window.electronAPI.getSetting('app-settings') as Partial<AppSettings> | null

            if (!settings) {
                return this.getDefaultSettings()
            }

            // 1. 先合并 providerConfigs（因为 llmConfig 需要从中获取配置）
            const mergedProviderConfigs = this.mergeProviderConfigs(settings.providerConfigs)

            // 2. 合并 llmConfig，从 providerConfigs 获取完整配置
            const llmConfig = this.mergeLLMConfig(settings.llmConfig, mergedProviderConfigs)

            // 3. 合并其他配置
            const merged: AppSettings = {
                llmConfig,
                language: settings.language || 'en',
                autoApprove: { ...defaultAutoApprove, ...settings.autoApprove },
                promptTemplateId: settings.promptTemplateId,
                agentConfig: { ...defaultAgentConfig, ...settings.agentConfig },
                providerConfigs: mergedProviderConfigs,
                aiInstructions: settings.aiInstructions || '',
                onboardingCompleted: settings.onboardingCompleted ?? false,
            }

            this.cache = merged
            return merged
        } catch (e) {
            logger.settings.error('[SettingsService] Failed to load settings:', e)
            return this.getDefaultSettings()
        }
    }

    /** 保存所有设置 */
    async saveAll(settings: AppSettings): Promise<void> {
        try {
            // 清理数据，只保存用户修改的部分
            const cleanedLLMConfig = cleanLLMConfig(settings.llmConfig)
            const cleanedProviderConfigs = cleanProviderConfigs(
                settings.providerConfigs,
                settings.llmConfig.provider
            )

            const cleaned = {
                llmConfig: cleanedLLMConfig,
                language: settings.language,
                autoApprove: settings.autoApprove,
                promptTemplateId: settings.promptTemplateId,
                agentConfig: settings.agentConfig,
                providerConfigs: cleanedProviderConfigs,
                aiInstructions: settings.aiInstructions,
                onboardingCompleted: settings.onboardingCompleted,
            }

            await window.electronAPI.setSetting('app-settings', cleaned)
            this.cache = settings  // 缓存完整的合并后配置

            logger.settings.info('[SettingsService] Settings saved (cleaned)', {
                providerCount: Object.keys(cleanedProviderConfigs).length,
                hasAdapterConfig: !!cleanedLLMConfig.adapterConfig,
            })
        } catch (e) {
            logger.settings.error('[SettingsService] Failed to save settings:', e)
            throw e
        }
    }

    /** 保存单个设置项 */
    async save<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
        const current = this.cache || await this.loadAll()
        const updated = { ...current, [key]: value } as AppSettings
        await this.saveAll(updated)
    }

    /** 获取单个设置项 */
    async get<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
        const settings = this.cache || await this.loadAll()
        return settings[key]
    }

    /** 获取缓存的设置（同步） */
    getCached(): AppSettings | null {
        return this.cache
    }

    /** 获取默认设置 */
    getDefaultSettings(): AppSettings {
        return {
            llmConfig: defaultLLMConfig,
            language: 'en',
            autoApprove: defaultAutoApprove,
            agentConfig: defaultAgentConfig,
            providerConfigs: generateDefaultProviderConfigs(),
            aiInstructions: '',
            onboardingCompleted: false,
        }
    }

    /** 
     * 合并 LLM 配置 
     * 新设计：llmConfig 只保存 provider 和 model，其他配置从 providerConfigs 获取
     */
    private mergeLLMConfig(
        saved?: Partial<LLMConfig>,
        providerConfigs?: Record<string, ProviderConfig>
    ): LLMConfig {
        if (!saved) return defaultLLMConfig

        const providerId = saved.provider || 'openai'
        const providerConfig = providerConfigs?.[providerId] || {}

        // 从 providerConfigs 获取完整配置
        const merged: LLMConfig = {
            ...defaultLLMConfig,
            provider: providerId,
            model: saved.model || providerConfig.model || defaultLLMConfig.model,
            apiKey: providerConfig.apiKey || '',
            baseUrl: providerConfig.baseUrl,
            timeout: providerConfig.timeout,
            adapterId: providerConfig.adapterId || providerId,
            adapterConfig: providerConfig.adapterConfig,
            parameters: {
                ...defaultLLMParameters,
                ...saved.parameters,
            },
        }

        // 如果没有 adapterConfig，从内置适配器获取
        if (!merged.adapterConfig) {
            const adapterId = merged.adapterId || merged.provider
            const builtinAdapter = getBuiltinAdapter(adapterId)
            if (builtinAdapter) {
                merged.adapterConfig = builtinAdapter
            } else {
                merged.adapterConfig = getAdapterConfig('openai')
            }
        }

        return merged
    }

    /** 合并 Provider 配置 */
    private mergeProviderConfigs(saved?: Record<string, ProviderConfig>): Record<string, ProviderConfig> {
        const defaults = generateDefaultProviderConfigs()

        if (!saved) return defaults

        const merged: Record<string, ProviderConfig> = { ...defaults }
        
        for (const [id, config] of Object.entries(saved)) {
            const isBuiltin = isBuiltinProvider(id)
            
            if (isBuiltin) {
                // 内置 Provider: 合并用户配置，但 adapterConfig 使用代码定义的
                merged[id] = {
                    ...defaults[id],
                    ...config,
                    // 强制使用内置的 adapterConfig
                    adapterConfig: defaults[id]?.adapterConfig || getAdapterConfig(id),
                }
            } else {
                // 自定义 Provider: 使用保存的完整配置
                merged[id] = {
                    ...config,
                    // 确保有 adapterConfig
                    adapterConfig: config.adapterConfig || getAdapterConfig('openai'),
                }
            }
        }

        return merged
    }

    /** 清除缓存 */
    clearCache(): void {
        this.cache = null
    }
}

// 导出单例
export const settingsService = new SettingsService()

// 导出默认值供其他模块使用
export {
    defaultLLMConfig,
    defaultLLMParameters,
    defaultAutoApprove,
    defaultAgentConfig,
    generateDefaultProviderConfigs,
    isBuiltinProvider,
}
