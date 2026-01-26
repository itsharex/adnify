/**
 * 同步服务 - 处理同步文本生成
 * 
 * 职责：
 * - 同步文本生成（用于后台任务、上下文压缩等）
 * - 不发送事件到渲染进程
 */

import { generateText } from 'ai'
import { logger } from '@shared/utils/Logger'
import { createModel } from './modelFactory'
import { MessageConverter } from './base/MessageConverter'
import { ToolConverter } from './base/ToolConverter'
import type { LLMConfig, LLMMessage, ToolDefinition } from '@shared/types'

export interface SyncParams {
  config: LLMConfig
  messages: LLMMessage[]
  tools?: ToolDefinition[]
  systemPrompt?: string
}

export interface SyncResult {
  content: string
  error?: string
}

export class SyncService {
  private messageConverter: MessageConverter
  private toolConverter: ToolConverter

  constructor() {
    this.messageConverter = new MessageConverter()
    this.toolConverter = new ToolConverter()
  }

  /**
   * 同步生成文本
   */
  async generate(params: SyncParams): Promise<SyncResult> {
    const { config, messages, tools, systemPrompt } = params

    logger.system.info('[SyncService] Starting generation', {
      provider: config.provider,
      model: config.model,
      messageCount: messages.length,
    })

    try {
      // 创建模型
      const model = createModel(config, {
        enableThinking: config.enableThinking,
      })

      // 转换消息和工具
      const coreMessages = this.messageConverter.convert(messages, systemPrompt)
      const coreTools = tools ? this.toolConverter.convert(tools) : undefined

      // 同步生成
      const result = await generateText({
        model,
        messages: coreMessages as any,
        tools: coreTools,
        maxOutputTokens: config.maxTokens || 1000,
        temperature: config.temperature ?? 0.3,
        topP: config.topP,
        topK: config.topK,
        seed: config.seed,
      })

      return { content: result.text }
    } catch (error: unknown) {
      const err = error as { message?: string }
      logger.system.error('[SyncService] Generation failed:', error)
      return { content: '', error: err.message || 'Unknown error' }
    }
  }
}
