/**
 * OpenAI Provider
 * 支持 OpenAI API 及兼容的第三方 API
 * 
 * 认证方式：
 * - 默认: Bearer token (Authorization header)
 * - 可通过 advanced.auth 配置自定义认证
 */

import OpenAI from 'openai'
import { BaseProvider } from './base'
import { ChatParams, ToolDefinition, LLMToolCall, MessageContent, LLMErrorCode, LLMConfig } from '../types'
import { adapterService } from '../adapterService'
import { AGENT_DEFAULTS } from '@shared/constants'
import { cleanToolCallArgs, fixUnescapedNewlines, fixMalformedJson } from '@shared/utils/jsonUtils'

export class OpenAIProvider extends BaseProvider {
  private client: OpenAI

  constructor(config: LLMConfig) {
    super('OpenAI')
    const timeoutMs = config.timeout || AGENT_DEFAULTS.DEFAULT_LLM_TIMEOUT
    
    const clientOptions: ConstructorParameters<typeof OpenAI>[0] = {
      apiKey: config.apiKey || 'ollama',
      baseURL: config.baseUrl,
      timeout: timeoutMs,
      maxRetries: 0,
    }
    
    // 应用高级配置
    if (config.advanced) {
      const defaultHeaders: Record<string, string> = {}
      
      // 自定义认证
      if (config.advanced.auth) {
        const { type, headerName } = config.advanced.auth
        if (type === 'api-key' && headerName) {
          // 使用自定义 header 名称传递 API key
          defaultHeaders[headerName] = config.apiKey
        }
        // bearer 是 OpenAI SDK 默认行为，无需额外处理
      }
      
      // 自定义请求头
      if (config.advanced.request?.headers) {
        Object.assign(defaultHeaders, config.advanced.request.headers)
      }
      
      if (Object.keys(defaultHeaders).length > 0) {
        clientOptions.defaultHeaders = defaultHeaders
      }
    }
    
    this.log('info', 'Initialized', { baseUrl: config.baseUrl || 'default' })
    this.client = new OpenAI(clientOptions)
  }

  private convertContent(
    content: MessageContent
  ): string | Array<OpenAI.Chat.Completions.ChatCompletionContentPart> {
    if (typeof content === 'string') return content
    return content.map((part) => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text }
      } else {
        const url =
          part.source.type === 'base64'
            ? `data:${part.source.media_type};base64,${part.source.data}`
            : part.source.data
        return { type: 'image_url', image_url: { url } }
      }
    })
  }

  private convertTools(tools?: ToolDefinition[], adapterId?: string): unknown[] | undefined {
    if (!tools?.length) return undefined
    // 使用适配器服务根据 adapterId 转换工具定义
    // 如果没有指定 adapterId，使用默认的 OpenAI 格式
    return adapterService.convertTools(tools, adapterId || 'openai')
  }

  async chat(params: ChatParams): Promise<void> {
    const {
      model,
      messages,
      tools,
      systemPrompt,
      maxTokens,
      temperature,
      topP,
      stream = true,  // 默认流式
      signal,
      adapterConfig,
      onStream,
      onToolCall,
      onComplete,
      onError,
    } = params

    try {
      this.log('info', 'Chat', { model, messageCount: messages.length, stream })

      const openaiMessages: OpenAI.ChatCompletionMessageParam[] = []

      if (systemPrompt) {
        openaiMessages.push({ role: 'system', content: systemPrompt })
      }

      for (const msg of messages) {
        if (msg.role === 'user') {
          openaiMessages.push({
            role: 'user',
            content: this.convertContent(msg.content),
          })
        } else if (msg.role === 'assistant') {
          let assistantContent: string | null = null
          if (typeof msg.content === 'string') {
            assistantContent = msg.content
          } else if (Array.isArray(msg.content)) {
            assistantContent = msg.content.map((p) => (p.type === 'text' ? p.text : '')).join('')
          }

          if (msg.tool_calls && msg.tool_calls.length > 0) {
            openaiMessages.push({
              role: 'assistant',
              content: assistantContent,
              tool_calls: msg.tool_calls,
            })
          } else {
            openaiMessages.push({
              role: 'assistant',
              content: assistantContent || '',
            })
          }
        } else if (msg.role === 'tool') {
          const toolCallId = msg.tool_call_id || msg.toolCallId
          if (!toolCallId) {
            this.log('warn', 'Tool message missing toolCallId, skipping')
            continue
          }
          openaiMessages.push({
            role: 'tool',
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
            tool_call_id: toolCallId,
          })
        } else if (msg.role === 'system') {
          openaiMessages.push({
            role: 'system',
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          })
        }
      }

      const convertedTools = this.convertTools(tools, adapterConfig?.id)

      // 构建请求体 - 使用适配器配置
      const requestBody: Record<string, unknown> = {
        model,
        messages: openaiMessages,
        max_tokens: maxTokens || AGENT_DEFAULTS.DEFAULT_MAX_TOKENS,
      }

      // 添加 LLM 参数
      if (temperature !== undefined) {
        requestBody.temperature = temperature
      }
      if (topP !== undefined) {
        requestBody.top_p = topP
      }

      if (convertedTools && convertedTools.length > 0) {
        requestBody.tools = convertedTools
      }

      // 应用适配器的请求体模板参数
      if (adapterConfig?.request?.bodyTemplate) {
        const template = adapterConfig.request.bodyTemplate
        for (const [key, value] of Object.entries(template)) {
          // 跳过占位符
          if (typeof value === 'string' && value.startsWith('{{')) continue
          // 不覆盖已设置的核心字段（stream 除外，由参数控制）
          if (['model', 'messages', 'tools'].includes(key)) continue
          // stream 由参数控制，不从模板读取
          if (key === 'stream') continue
          requestBody[key] = value
        }
      }

      // 根据 stream 参数决定请求模式
      if (stream) {
        requestBody.stream = true
        requestBody.stream_options = { include_usage: true }
        await this.handleStreamResponse(requestBody, signal, adapterConfig, onStream, onToolCall, onComplete)
      } else {
        requestBody.stream = false
        await this.handleNonStreamResponse(requestBody, signal, adapterConfig, onStream, onToolCall, onComplete)
      }
    } catch (error: unknown) {
      const llmError = this.parseError(error)
      // ABORTED 是用户主动取消，不是错误
      if (llmError.code === LLMErrorCode.ABORTED) {
        this.log('info', 'Chat aborted by user')
      } else {
        this.log('error', 'Chat failed', { code: llmError.code, message: llmError.message })
      }
      onError(llmError)
    }
  }

  /**
   * 处理流式响应
   */
  private async handleStreamResponse(
    requestBody: Record<string, unknown>,
    signal: AbortSignal | undefined,
    adapterConfig: ChatParams['adapterConfig'],
    onStream: ChatParams['onStream'],
    onToolCall: ChatParams['onToolCall'],
    onComplete: ChatParams['onComplete']
  ): Promise<void> {
    const stream = await this.client.chat.completions.create(
      requestBody as unknown as OpenAI.ChatCompletionCreateParamsStreaming,
      { signal }
    )

    let fullContent = ''
    let fullReasoning = ''
    let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined
    const toolCalls: LLMToolCall[] = []
    let currentToolCall: { id?: string; name?: string; argsString: string } | null = null

    for await (const chunk of stream) {
      // 捕获 usage 信息（在最后一个 chunk 中）
      if ((chunk as any).usage) {
        const u = (chunk as any).usage
        usage = {
          promptTokens: u.prompt_tokens || 0,
          completionTokens: u.completion_tokens || 0,
          totalTokens: u.total_tokens || 0,
        }
      }

      interface ExtendedDelta {
        content?: string
        [key: string]: unknown
        tool_calls?: Array<{
          index?: number
          id?: string
          function?: { name?: string; arguments?: string }
        }>
      }
      const delta = chunk.choices[0]?.delta as ExtendedDelta | undefined

      if (delta?.content) {
        fullContent += delta.content
        onStream({ type: 'text', content: delta.content })
      }

      // 使用适配器配置的 reasoning 字段名
      const reasoningField = adapterConfig?.response?.reasoningField || 'reasoning'
      const getNestedValue = (obj: any, path: string): any => {
        return path.split('.').reduce((acc, part) => acc && acc[part], obj)
      }
      const reasoningContent = getNestedValue(delta, reasoningField) as string | undefined
      if (reasoningContent) {
        fullReasoning += reasoningContent
        onStream({ type: 'reasoning', content: reasoningContent })
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.index !== undefined) {
            if (tc.id) {
              if (currentToolCall?.id) {
                const finalToolCall = this.finalizeToolCall(currentToolCall)
                if (finalToolCall) {
                  toolCalls.push(finalToolCall)
                  onStream({ type: 'tool_call_end', toolCall: finalToolCall })
                  onToolCall(finalToolCall)
                }
              }
              currentToolCall = {
                id: tc.id,
                name: tc.function?.name,
                argsString: tc.function?.arguments || '',
              }
              onStream({
                type: 'tool_call_start',
                toolCallDelta: { id: tc.id, name: tc.function?.name },
              })
              if (tc.function?.arguments) {
                onStream({
                  type: 'tool_call_delta',
                  toolCallDelta: { id: tc.id, args: tc.function.arguments },
                })
              }
            } else if (currentToolCall) {
              if (tc.function?.name) {
                currentToolCall.name = tc.function.name
                onStream({
                  type: 'tool_call_delta',
                  toolCallDelta: { id: currentToolCall.id, name: tc.function.name },
                })
              }
              if (tc.function?.arguments) {
                currentToolCall.argsString += tc.function.arguments
                onStream({
                  type: 'tool_call_delta',
                  toolCallDelta: { id: currentToolCall.id, args: tc.function.arguments },
                })
              }
            }
          }
        }
      }
    }

    if (currentToolCall?.id) {
      const finalToolCall = this.finalizeToolCall(currentToolCall)
      if (finalToolCall) {
        toolCalls.push(finalToolCall)
        onStream({ type: 'tool_call_end', toolCall: finalToolCall })
        onToolCall(finalToolCall)
      }
    }

    const finalContent = fullContent || (fullReasoning ? `[Reasoning]\n${fullReasoning}` : '')
    onComplete({
      content: finalContent,
      reasoning: fullReasoning || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
    })
  }

  /**
   * 处理非流式响应
   */
  private async handleNonStreamResponse(
    requestBody: Record<string, unknown>,
    signal: AbortSignal | undefined,
    adapterConfig: ChatParams['adapterConfig'],
    onStream: ChatParams['onStream'],
    onToolCall: ChatParams['onToolCall'],
    onComplete: ChatParams['onComplete']
  ): Promise<void> {
    const response = await this.client.chat.completions.create(
      requestBody as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming,
      { signal }
    )

    const message = response.choices[0]?.message
    const content = message?.content || ''
    
    // 一次性发送内容
    if (content) {
      onStream({ type: 'text', content })
    }

    // 处理 reasoning（如果有）
    const reasoningField = adapterConfig?.response?.reasoningField || 'reasoning'
    const reasoning = (message as any)?.[reasoningField] as string | undefined
    if (reasoning) {
      onStream({ type: 'reasoning', content: reasoning })
    }

    // 处理工具调用
    const toolCalls: LLMToolCall[] = []
    if (message?.tool_calls) {
      for (const tc of message.tool_calls) {
        // SDK v6: tool_calls 可能是 function 类型或 custom 类型
        if (tc.type === 'function') {
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.function.arguments || '{}')
          } catch {
            this.log('warn', 'Failed to parse tool arguments')
          }
          const toolCall: LLMToolCall = {
            id: tc.id,
            name: tc.function.name,
            arguments: args,
          }
          toolCalls.push(toolCall)
          onToolCall(toolCall)
        } else if (tc.type === 'custom') {
          // 处理 custom tool call（SDK v6 新增）
          const toolCall: LLMToolCall = {
            id: tc.id,
            name: tc.custom.name,
            arguments: { input: tc.custom.input },
          }
          toolCalls.push(toolCall)
          onToolCall(toolCall)
        }
      }
    }

    // 提取 usage
    const usage = response.usage ? {
      promptTokens: response.usage.prompt_tokens || 0,
      completionTokens: response.usage.completion_tokens || 0,
      totalTokens: response.usage.total_tokens || 0,
    } : undefined

    onComplete({
      content,
      reasoning: reasoning || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
    })
  }

  private finalizeToolCall(tc: {
    id?: string
    name?: string
    argsString: string
  }): LLMToolCall | null {
    if (!tc.id || !tc.name) return null

    let argsStr = tc.argsString || '{}'
    argsStr = cleanToolCallArgs(argsStr)

    try {
      const args = JSON.parse(argsStr)
      return { id: tc.id, name: tc.name, arguments: args }
    } catch {
      try {
        const fixed = fixUnescapedNewlines(argsStr)
        const args = JSON.parse(fixed)
        return { id: tc.id, name: tc.name, arguments: args }
      } catch {
        try {
          const fixed = fixMalformedJson(argsStr)
          const args = JSON.parse(fixed)
          return { id: tc.id, name: tc.name, arguments: args }
        } catch {
          this.log('error', 'Failed to parse tool call arguments')
          return null
        }
      }
    }
  }
}
