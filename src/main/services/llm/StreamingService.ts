/**
 * 流式服务 - 处理流式文本生成
 * 
 * 职责：
 * - 流式文本生成
 * - 工具调用处理
 * - 推理过程处理（Extended Thinking）
 * - 事件发送到渲染进程
 */

import { streamText } from 'ai'
import { logger } from '@shared/utils/Logger'
import { BrowserWindow } from 'electron'
import { createModel } from './modelFactory'
import { MessageConverter } from './base/MessageConverter'
import { ToolConverter } from './base/ToolConverter'
import type { LLMConfig, LLMMessage, ToolDefinition } from '@shared/types'

export interface StreamingParams {
  config: LLMConfig
  messages: LLMMessage[]
  tools?: ToolDefinition[]
  systemPrompt?: string
  abortSignal?: AbortSignal
}

export interface StreamingResult {
  content: string
  reasoning?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  finishReason?: string
}

export class StreamingService {
  private window: BrowserWindow
  private messageConverter: MessageConverter
  private toolConverter: ToolConverter

  constructor(window: BrowserWindow) {
    this.window = window
    this.messageConverter = new MessageConverter()
    this.toolConverter = new ToolConverter()
  }

  /**
   * 流式生成文本
   */
  async generate(params: StreamingParams): Promise<StreamingResult> {
    const { config, messages, tools, systemPrompt, abortSignal } = params

    logger.system.info('[StreamingService] Starting generation', {
      provider: config.provider,
      model: config.model,
      messageCount: messages.length,
      toolCount: tools?.length || 0,
    })

    // 创建模型
    const model = createModel(config, {
      enableThinking: config.enableThinking,
    })

    // 转换消息和工具
    const coreMessages = this.messageConverter.convert(messages, systemPrompt)
    const coreTools = tools ? this.toolConverter.convert(tools) : undefined

    // 流式生成
    const result = streamText({
      model,
      messages: coreMessages,
      tools: coreTools,
      maxOutputTokens: config.maxTokens,
      temperature: config.temperature,
      topP: config.topP,
      topK: config.topK,
      frequencyPenalty: config.frequencyPenalty,
      presencePenalty: config.presencePenalty,
      stopSequences: config.stopSequences,
      seed: config.seed,
      abortSignal,
      // Anthropic Extended Thinking
      ...(config.enableThinking && config.provider === 'anthropic' && {
        providerOptions: {
          anthropic: {
            thinking: { type: 'enabled', budgetTokens: 10000 },
          },
        },
      }),
    })

    // 处理流式响应
    return await this.processStream(result, config.enableThinking)
  }

  /**
   * 处理流式响应
   */
  private async processStream(result: any, enableThinking?: boolean): Promise<StreamingResult> {
    let reasoning = ''

    for await (const part of result.fullStream) {
      if (this.window.isDestroyed()) break

      try {
        switch (part.type) {
          case 'text-delta':
            this.sendToRenderer('llm:stream', {
              type: 'text',
              content: part.text,
            })
            break

          case 'reasoning-delta':
            if (enableThinking) {
              reasoning += part.text || ''
              this.sendToRenderer('llm:stream', {
                type: 'reasoning',
                content: part.text,
              })
            }
            break

          case 'tool-call':
            this.sendToRenderer('llm:toolCall', {
              type: 'tool_call',
              id: part.toolCallId,
              name: part.toolName,
              arguments: part.input,
            })
            break

          case 'error':
            this.handleError(part.error)
            break
        }
      } catch (error) {
        // 忽略窗口已销毁的错误
        if (!this.window.isDestroyed()) {
          logger.llm.warn('[StreamingService] Error processing stream part:', error)
        }
      }
    }

    // 获取最终结果
    const finalResult = await result
    const usage = await finalResult.usage

    const streamingResult: StreamingResult = {
      content: await finalResult.text,
      reasoning: enableThinking ? (reasoning || undefined) : undefined,
      usage: usage
        ? {
          promptTokens: usage.inputTokens,
          completionTokens: usage.outputTokens,
          totalTokens: (usage.inputTokens || 0) + (usage.outputTokens || 0),
        }
        : undefined,
      finishReason: await finalResult.finishReason,
    }

    // 发送完成事件
    this.sendToRenderer('llm:done', streamingResult)

    return streamingResult
  }

  /**
   * 发送消息到渲染进程
   */
  private sendToRenderer(channel: string, data: any): void {
    if (!this.window.isDestroyed()) {
      try {
        this.window.webContents.send(channel, data)
      } catch (error) {
        logger.llm.warn(`[StreamingService] Failed to send to renderer: ${channel}`, error)
      }
    }
  }

  /**
   * 错误处理
   */
  private handleError(error: unknown): void {
    const err = error as { name?: string; message?: string; status?: number }

    // 忽略中止错误
    if (err.name === 'AbortError') {
      return
    }

    logger.llm.error('[StreamingService] Error:', {
      name: err.name,
      message: err.message,
      status: err.status,
    })

    // 解析错误类型
    let code = 'UNKNOWN'
    let retryable = false

    if (err.status === 429) {
      code = 'RATE_LIMIT'
      retryable = true
    } else if (err.status === 401 || err.status === 403) {
      code = 'AUTH'
    } else if (err.message?.includes('network') || err.message?.includes('fetch')) {
      code = 'NETWORK'
      retryable = true
    }

    this.sendToRenderer('llm:error', {
      message: err.message || 'Unknown error',
      code,
      retryable,
    })
  }
}
