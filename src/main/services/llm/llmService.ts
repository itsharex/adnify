/**
 * LLM 服务
 * 统一管理 LLM Provider，处理消息发送和事件分发
 */

import { logger } from '@shared/utils/Logger'
import { BrowserWindow } from 'electron'
import { OpenAIProvider } from './providers/openai'
import { AnthropicProvider } from './providers/anthropic'
import { GeminiProvider } from './providers/gemini'
import { LLMProvider, LLMMessage, LLMConfig, ToolDefinition, LLMErrorCode } from './types'

// Provider 缓存条目
interface ProviderCacheEntry {
  provider: LLMProvider
  lastUsed: number
  useCount: number
}

// 缓存配置
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 分钟
const CACHE_MAX_SIZE = 10 // 最多缓存 10 个 provider
const CACHE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 分钟清理一次

export class LLMService {
  private window: BrowserWindow
  private providerCache: Map<string, ProviderCacheEntry> = new Map()
  private currentAbortController: AbortController | null = null
  private cleanupTimer: NodeJS.Timeout | null = null

  constructor(window: BrowserWindow) {
    this.window = window
    this.startCacheCleanup()
  }

  /**
   * 启动缓存清理定时器
   */
  private startCacheCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredProviders()
    }, CACHE_CLEANUP_INTERVAL_MS)
  }

  /**
   * 清理过期的 Provider
   */
  private cleanupExpiredProviders(): void {
    const now = Date.now()
    const expiredKeys: string[] = []

    for (const [key, entry] of this.providerCache) {
      if (now - entry.lastUsed > CACHE_TTL_MS) {
        expiredKeys.push(key)
      }
    }

    for (const key of expiredKeys) {
      this.providerCache.delete(key)
      logger.system.info('[LLMService] Expired provider removed:', key)
    }

    // 如果缓存超过最大大小，移除最少使用的
    if (this.providerCache.size > CACHE_MAX_SIZE) {
      const entries = Array.from(this.providerCache.entries())
        .sort((a, b) => a[1].useCount - b[1].useCount)

      const toRemove = entries.slice(0, this.providerCache.size - CACHE_MAX_SIZE)
      for (const [key] of toRemove) {
        this.providerCache.delete(key)
        logger.system.info('[LLMService] LRU provider removed:', key)
      }
    }
  }

  /**
   * 生成 Provider 缓存 key
   */
  private getProviderKey(config: LLMConfig): string {
    const adapterKey = config.adapterConfig?.id || config.adapterId || config.provider
    // 简化 key，只包含必要信息
    return `${adapterKey}:${config.baseUrl || 'default'}:${config.apiKey?.slice(-8) || 'nokey'}`
  }

  /**
   * 获取或创建 Provider 实例
   * 根据 adapter 类型选择实现：
   * - anthropic → AnthropicProvider
   * - gemini → GeminiProvider
   * - 其他（openai, deepseek, qwen, zhipu, groq, mistral, ollama, custom）→ OpenAIProvider
   */
  private getProvider(config: LLMConfig): LLMProvider {
    const key = this.getProviderKey(config)
    const cached = this.providerCache.get(key)

    if (cached) {
      cached.lastUsed = Date.now()
      cached.useCount++
      return cached.provider
    }

    const adapterKey = config.adapterConfig?.id || config.adapterId || config.provider
    logger.system.info('[LLMService] Creating new provider:', config.provider, 'adapter:', adapterKey, 'timeout:', config.timeout)

    let provider: LLMProvider

    // 根据 adapter 类型选择实现
    switch (adapterKey) {
      case 'anthropic':
        provider = new AnthropicProvider(config.apiKey, config.baseUrl, config.timeout)
        break
      case 'gemini':
        provider = new GeminiProvider(config.apiKey, config.baseUrl, config.timeout)
        break
      default:
        // 所有 OpenAI 兼容的 provider：openai, deepseek, qwen, zhipu, groq, mistral, ollama, custom 等
        provider = new OpenAIProvider(
          config.apiKey || 'ollama', // Ollama 不需要 API key
          config.baseUrl,
          config.timeout
        )
        break
    }

    this.providerCache.set(key, {
      provider,
      lastUsed: Date.now(),
      useCount: 1,
    })

    return provider
  }

  /**
   * 发送消息到 LLM
   */
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
      messageCount: messages.length,
      hasTools: !!tools?.length,
    })

    this.currentAbortController = new AbortController()

    try {
      const provider = this.getProvider(config)

      await provider.chat({
        model: config.model,
        messages,
        tools,
        systemPrompt,
        maxTokens: config.maxTokens,
        signal: this.currentAbortController.signal,
        // 完整适配器配置
        adapterConfig: config.adapterConfig,

        onStream: (chunk) => {
          if (!this.window.isDestroyed()) {
            try {
              this.window.webContents.send('llm:stream', chunk)
            } catch (e) {
              // 忽略窗口已销毁的错误
            }
          }
        },

        onToolCall: (toolCall) => {
          if (!this.window.isDestroyed()) {
            try {
              this.window.webContents.send('llm:toolCall', toolCall)
            } catch (e) {
              // 忽略窗口已销毁的错误
            }
          }
        },

        onComplete: (result) => {
          logger.system.info('[LLMService] Complete', {
            contentLength: result.content.length,
            toolCallCount: result.toolCalls?.length || 0,
          })
          if (!this.window.isDestroyed()) {
            try {
              this.window.webContents.send('llm:done', result)
            } catch (e) {
              // 忽略窗口已销毁的错误
            }
          }
        },

        onError: (error) => {
          logger.system.error('[LLMService] Error', {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
          })
          if (!this.window.isDestroyed()) {
            try {
              this.window.webContents.send('llm:error', {
                message: error.message,
                code: error.code,
                retryable: error.retryable,
              })
            } catch (e) {
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
          } catch (e) {
            // 忽略窗口已销毁的错误
          }
        }
      }
    }
  }

  /**
   * 中止当前请求
   */
  abort() {
    if (this.currentAbortController) {
      logger.system.info('[LLMService] Aborting request')
      this.currentAbortController.abort()
      this.currentAbortController = null
    }
  }

  /**
   * 清除 Provider 缓存
   */
  clearProviders() {
    this.providerCache.clear()
    logger.system.info('[LLMService] Provider cache cleared')
  }

  /**
   * 销毁服务，清理资源
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.providerCache.clear()
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { size: number; entries: Array<{ key: string; useCount: number; lastUsed: number }> } {
    return {
      size: this.providerCache.size,
      entries: Array.from(this.providerCache.entries()).map(([key, entry]) => ({
        key,
        useCount: entry.useCount,
        lastUsed: entry.lastUsed,
      })),
    }
  }
}
