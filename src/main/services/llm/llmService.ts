/**
 * LLM 服务
 *
 * 使用 Vercel AI SDK 统一处理 LLM 请求
 */

import { streamText, generateText, tool } from 'ai'
import { logger } from '@shared/utils/Logger'
import { BrowserWindow } from 'electron'
import { createModel, type ModelOptions } from './modelFactory'
import type { LLMConfig, LLMMessage, ToolDefinition, MessageContentPart } from '@/shared/types'
import { z } from 'zod'

export class LLMService {
  private window: BrowserWindow
  private currentAbortController: AbortController | null = null

  constructor(window: BrowserWindow) {
    this.window = window
  }

  /**
   * 发送消息（流式响应）
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
      toolCount: tools?.length || 0,
    })

    this.currentAbortController = new AbortController()

    try {
      // 创建 model
      const modelOptions: ModelOptions = {
        enableThinking: config.enableThinking,
      }
      const model = createModel(config, modelOptions)

      // 转换消息格式 - 直接生成 AI SDK 兼容格式
      const coreMessages = this.convertToAISDKMessages(messages, systemPrompt)

      // 转换工具定义
      const coreTools = tools ? this.convertTools(tools) : undefined

      // 使用 AI SDK streamText
      const result = streamText({
        model,
        messages: coreMessages,
        tools: coreTools,
        maxOutputTokens: config.maxTokens,
        temperature: config.temperature,
        topP: config.topP,
        frequencyPenalty: config.frequencyPenalty,
        presencePenalty: config.presencePenalty,
        stopSequences: config.stopSequences,
        topK: config.topK,
        seed: config.seed,
        abortSignal: this.currentAbortController.signal,
        // Anthropic extended thinking 配置
        ...(config.enableThinking && {
          providerOptions: {
            anthropic: {
              thinking: { type: 'enabled', budgetTokens: 10000 },
            },
          },
        }),
      })

      // 处理流式响应
      let reasoning = ''
      for await (const part of result.fullStream) {
        if (this.window.isDestroyed()) break

        try {
          switch (part.type) {
            case 'text-delta':
              this.window.webContents.send('llm:stream', {
                type: 'text',
                content: part.text,
              })
              break

            case 'reasoning-delta':
              if (config.enableThinking) {
                reasoning += part.text || ''
                this.window.webContents.send('llm:stream', {
                  type: 'reasoning',
                  content: part.text,
                })
              }
              break

            case 'tool-call':
              this.window.webContents.send('llm:toolCall', {
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
        } catch {
          // 忽略窗口已销毁的错误
        }
      }

      // 获取最终结果
      const finalResult = await result
      const usage = await finalResult.usage

      if (!this.window.isDestroyed()) {
        try {
          this.window.webContents.send('llm:done', {
            content: await finalResult.text,
            reasoning: config.enableThinking ? (reasoning || undefined) : undefined,
            usage: usage
              ? {
                promptTokens: usage.inputTokens,
                completionTokens: usage.outputTokens,
                totalTokens: (usage.inputTokens || 0) + (usage.outputTokens || 0),
              }
              : undefined,
            finishReason: await finalResult.finishReason,
          })
        } catch {
          // 忽略窗口已销毁的错误
        }
      }
    } catch (error: unknown) {
      this.handleError(error)
    }
  }

  /**
   * 中止当前请求
   */
  abort() {
    if (this.currentAbortController) {
      this.currentAbortController.abort()
      this.currentAbortController = null
    }
  }

  /**
   * 同步发送消息（用于上下文压缩等后台任务）
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

    try {
      const modelOptions: ModelOptions = {
        enableThinking: config.enableThinking,
      }
      const model = createModel(config, modelOptions)
      const coreMessages = this.convertToAISDKMessages(messages, systemPrompt)
      const coreTools = tools ? this.convertTools(tools) : undefined

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
      logger.system.error('[LLMService] sendMessageSync error:', error)
      return { content: '', error: err.message || 'Unknown error' }
    }
  }

  /**
   * 转换消息为 AI SDK 兼容格式
   * 
   * 统一的消息转换方法，直接生成符合 AI SDK CoreMessage 规范的消息
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertToAISDKMessages(messages: LLMMessage[], systemPrompt?: string): any[] {
    const result: any[] = []

    // 添加 system prompt
    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt })
    }

    for (const msg of messages) {
      if (msg.role === 'system') {
        result.push({
          role: 'system',
          content: this.extractTextContent(msg.content),
        })
      } else if (msg.role === 'user') {
        // 用户消息：支持文本和图片
        if (typeof msg.content === 'string') {
          if (msg.content.trim()) {
            result.push({ role: 'user', content: msg.content })
          }
        } else if (Array.isArray(msg.content)) {
          const parts = this.convertUserContentParts(msg.content)
          if (parts.length > 0) {
            result.push({ role: 'user', content: parts })
          }
        }
      } else if (msg.role === 'assistant') {
        // 助手消息：支持文本和工具调用
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          const content = this.convertAssistantWithToolCalls(msg)
          if (content.length > 0) {
            result.push({ role: 'assistant', content })
          }
        } else {
          const textContent = this.extractTextContent(msg.content)
          if (textContent) {
            result.push({ role: 'assistant', content: textContent })
          }
        }
      } else if (msg.role === 'tool') {
        // 工具结果消息
        if (msg.tool_call_id) {
          result.push({
            role: 'tool',
            content: [{
              type: 'tool-result',
              toolCallId: msg.tool_call_id,
              toolName: msg.name || 'unknown',
              output: {
                type: 'text',
                value: this.extractTextContent(msg.content),
              },
            }],
          })
        }
      }
    }

    return result
  }

  /**
   * 转换用户消息内容部分
   */
  private convertUserContentParts(content: MessageContentPart[]): any[] {
    const parts: any[] = []

    for (const item of content) {
      if (!item || typeof item !== 'object' || !('type' in item)) continue

      if (item.type === 'text' && 'text' in item && item.text) {
        parts.push({ type: 'text', text: item.text })
      } else if (item.type === 'image' && 'source' in item) {
        const source = item.source as { type: string; media_type: string; data: string }
        if (source?.data) {
          const dataUrl = source.type === 'url'
            ? source.data
            : `data:${source.media_type};base64,${source.data}`
          parts.push({ type: 'image', image: dataUrl })
        }
      }
      // 忽略其他非标准类型（如 tool-approval-request 等）
    }

    return parts
  }

  /**
   * 转换包含工具调用的助手消息
   */
  private convertAssistantWithToolCalls(msg: LLMMessage): any[] {
    const content: any[] = []

    // 添加文本内容
    const textContent = this.extractTextContent(msg.content)
    if (textContent) {
      content.push({ type: 'text', text: textContent })
    }

    // 添加工具调用
    for (const tc of msg.tool_calls || []) {
      try {
        content.push({
          type: 'tool-call',
          toolCallId: tc.id,
          toolName: tc.function.name,
          input: typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments,
        })
      } catch {
        logger.llm.warn('[LLMService] Skipping invalid tool call:', tc.id)
      }
    }

    return content
  }

  /**
   * 提取文本内容
   */
  private extractTextContent(content: string | MessageContentPart[] | null): string {
    if (content === null || content === undefined) return ''
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text' && 'text' in c)
        .map((c) => c.text)
        .join('')
    }
    return ''
  }

  /**
   * 转换工具定义为 AI SDK 格式
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertTools(tools: ToolDefinition[]): Record<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, any> = {}

    for (const t of tools) {
      const schema = this.jsonSchemaToZod(t.parameters)
      result[t.name] = tool({
        description: t.description,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parameters: schema as any,
      } as any)
    }

    return result
  }

  /**
   * JSON Schema 到 Zod 转换
   */
  private jsonSchemaToZod(schema: Record<string, unknown>): z.ZodTypeAny {
    const type = schema.type as string
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined
    const required = (schema.required as string[]) || []

    if (type === 'object' && properties) {
      const shape: Record<string, z.ZodTypeAny> = {}

      for (const [key, prop] of Object.entries(properties)) {
        let fieldSchema = this.jsonSchemaToZod(prop)
        const description = prop.description as string | undefined

        if (description) {
          fieldSchema = fieldSchema.describe(description)
        }

        if (!required.includes(key)) {
          fieldSchema = fieldSchema.optional()
        }

        shape[key] = fieldSchema
      }

      return z.object(shape)
    }

    if (type === 'array') {
      const items = schema.items as Record<string, unknown> | undefined
      if (items) {
        return z.array(this.jsonSchemaToZod(items))
      }
      return z.array(z.unknown())
    }

    if (type === 'string') {
      const enumValues = schema.enum as string[] | undefined
      if (enumValues) {
        return z.enum(enumValues as [string, ...string[]])
      }
      return z.string()
    }

    if (type === 'number' || type === 'integer') {
      return z.number()
    }

    if (type === 'boolean') {
      return z.boolean()
    }

    return z.unknown()
  }

  /**
   * 错误处理
   */
  private handleError(error: unknown) {
    const err = error as { name?: string; message?: string; status?: number }

    // 忽略中止错误
    if (err.name === 'AbortError') {
      return
    }

    logger.llm.error('[LLMService] Error:', {
      name: err.name,
      message: err.message,
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

    if (!this.window.isDestroyed()) {
      try {
        this.window.webContents.send('llm:error', {
          message: err.message || 'Unknown error',
          code,
          retryable,
        })
      } catch {
        // 忽略窗口已销毁的错误
      }
    }
  }

  destroy() {
    this.abort()
  }
}
