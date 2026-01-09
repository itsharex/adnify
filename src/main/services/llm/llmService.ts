/**
 * LLM 服务
 * 统一管理 LLM Provider，处理消息发送和事件分发
 * 
 * 路由规则：
 * 1. 所有请求统一使用 UnifiedProvider
 * 2. UnifiedProvider 根据 protocol 自动选择处理方式
 */

import { logger } from '@shared/utils/Logger'
import { BrowserWindow } from 'electron'
import { UnifiedProvider } from './providers/unified'
import { LLMProvider, LLMMessage, LLMConfig, ToolDefinition, LLMErrorCode } from './types'
import { CacheService } from '@shared/utils/CacheService'
import { getCacheConfig } from '@shared/config/agentConfig'

interface ProviderCacheEntry {
  provider: LLMProvider
  configHash: string
}

export class LLMService {
  private window: BrowserWindow
  private providerCache: CacheService<ProviderCacheEntry>
  private currentAbortController: AbortController | null = null

  constructor(window: BrowserWindow) {
    this.window = window
    
    // 使用统一缓存配置
    const cacheConfig = getCacheConfig('llmProvider')
    this.providerCache = new CacheService<ProviderCacheEntry>('LLMProvider', {
      maxSize: cacheConfig.maxSize,
      defaultTTL: cacheConfig.ttlMs,
      evictionPolicy: cacheConfig.evictionPolicy || 'lfu',
      cleanupInterval: cacheConfig.cleanupInterval || 5 * 60 * 1000,
    })
  }

  private generateConfigHash(config: LLMConfig): string {
    const relevantConfig = {
      provider: config.provider,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeout: config.timeout,
      protocol: config.adapterConfig?.protocol,
      // 包含 advanced 配置的关键部分
      advancedAuth: config.advanced?.auth,
      advancedRequest: config.advanced?.request,
    }
    return JSON.stringify(relevantConfig)
  }

  private getProviderKey(config: LLMConfig): string {
    const protocol = config.adapterConfig?.protocol || 'openai'
    return `${config.provider}:${protocol}:${config.baseUrl || 'default'}`
  }

  /**
   * 获取或创建 Provider 实例
   * 统一使用 UnifiedProvider，根据 protocol 自动路由
   */
  private getProvider(config: LLMConfig): LLMProvider {
    const key = this.getProviderKey(config)
    const configHash = this.generateConfigHash(config)
    const cached = this.providerCache.get(key)

    if (cached && cached.configHash === configHash) {
      return cached.provider
    }

    if (cached && cached.configHash !== configHash) {
      this.providerCache.delete(key)
    }

    // 统一使用 UnifiedProvider
    const provider = new UnifiedProvider(config)

    this.providerCache.set(key, {
      provider,
      configHash,
    })

    return provider
  }

  invalidateProvider(providerId: string): void {
    const keysToDelete: string[] = []
    for (const key of this.providerCache.keys()) {
      if (key.startsWith(providerId + ':')) {
        keysToDelete.push(key)
      }
    }
    this.providerCache.deleteMany(keysToDelete)
  }

  invalidateAllProviders(): void {
    this.providerCache.clear()
  }

  async sendMessage(params: {
    config: LLMConfig
    messages: LLMMessage[]
    tools?: ToolDefinition[]
    systemPrompt?: string
  }) {
    const { config, messages, tools, systemPrompt } = params

    logger.system.info('[LLMService] sendMessage', {
      provider: config.provider,
      model: config.model,
      protocol: config.adapterConfig?.protocol || 'auto',
      messageCount: messages.length,
      hasTools: !!tools?.length,
      toolCount: tools?.length || 0,
    })

    this.currentAbortController = new AbortController()

    try {
      const provider = this.getProvider(config)
      
      // 从 adapterConfig 的 bodyTemplate 中读取 stream 配置，默认 true
      const stream = config.adapterConfig?.request?.bodyTemplate?.stream !== false

      await provider.chat({
        model: config.model,
        messages,
        tools,
        systemPrompt,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        topP: config.topP,
        stream,
        signal: this.currentAbortController.signal,
        adapterConfig: config.adapterConfig,

        onStream: (chunk) => {
          if (!this.window.isDestroyed()) {
            try {
              this.window.webContents.send('llm:stream', chunk)
            } catch {
              // 忽略窗口已销毁的错误
            }
          }
        },

        onToolCall: (toolCall) => {
          if (!this.window.isDestroyed()) {
            try {
              this.window.webContents.send('llm:toolCall', toolCall)
            } catch {
              // 忽略窗口已销毁的错误
            }
          }
        },

        onComplete: (result) => {
          if (!this.window.isDestroyed()) {
            try {
              this.window.webContents.send('llm:done', result)
            } catch {
              // 忽略窗口已销毁的错误
            }
          }
        },

        onError: (error) => {
          if (error.code !== LLMErrorCode.ABORTED) {
            logger.system.error('[LLMService] Error', { code: error.code, message: error.message })
          }
          if (!this.window.isDestroyed()) {
            try {
              this.window.webContents.send('llm:error', {
                message: error.message,
                code: error.code,
                retryable: error.retryable,
              })
            } catch {
              // 忽略窗口已销毁的错误
            }
          }
        },
      })
    } catch (error: unknown) {
      const err = error as { name?: string; message?: string }
      if (err.name !== 'AbortError') {
        logger.system.error('[LLMService] Uncaught error:', error)
        if (!this.window.isDestroyed()) {
          try {
            this.window.webContents.send('llm:error', {
              message: err.message || 'Unknown error',
              code: LLMErrorCode.UNKNOWN,
              retryable: false,
            })
          } catch {
            // 忽略窗口已销毁的错误
          }
        }
      }
    }
  }

  abort() {
    if (this.currentAbortController) {
      this.currentAbortController.abort()
      this.currentAbortController = null
    }
  }

  /**
   * 同步发送消息（不使用流式，直接返回结果）
   * 用于上下文压缩等后台任务
   */
  async sendMessageSync(params: {
    config: LLMConfig
    messages: LLMMessage[]
    tools?: ToolDefinition[]
    systemPrompt?: string
  }): Promise<{ content: string; error?: string }> {
    const { config, messages, tools, systemPrompt } = params

    logger.system.info('[LLMService] sendMessageSync', {
      provider: config.provider,
      model: config.model,
      messageCount: messages.length,
    })

    const abortController = new AbortController()
    let content = ''

    try {
      const provider = this.getProvider(config)
      
      // 同步请求使用流式（累积内容），但不发送到前端
      const stream = true

      await provider.chat({
        model: config.model,
        messages,
        tools,
        systemPrompt,
        maxTokens: config.maxTokens || 1000,
        temperature: config.temperature ?? 0.3,
        topP: config.topP,
        stream,
        signal: abortController.signal,
        adapterConfig: config.adapterConfig,

        onStream: (chunk) => {
          if (chunk.type === 'text' && chunk.content) {
            content += chunk.content
          }
        },

        onToolCall: () => {
          // 压缩任务不需要工具调用
        },

        onComplete: () => {
          // 完成
        },

        onError: (error) => {
          logger.system.error('[LLMService] Sync error:', error)
          throw new Error(error.message)
        },
      })

      return { content }
    } catch (error: unknown) {
      const err = error as { message?: string }
      logger.system.error('[LLMService] sendMessageSync error:', error)
      return { content: '', error: err.message || 'Unknown error' }
    }
  }

  clearProviders() {
    this.providerCache.clear()
  }

  destroy() {
    this.providerCache.destroy()
  }

  getCacheStats() {
    return this.providerCache.getStats()
  }
}
