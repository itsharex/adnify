/**
 * OpenAI Provider
 * 支持 OpenAI API 及兼容的第三方 API
 */

import OpenAI from 'openai'
import { BaseProvider } from './base'
import { ChatParams, ToolDefinition, ToolCall, MessageContent } from '../types'

export class OpenAIProvider extends BaseProvider {
  private client: OpenAI

  constructor(apiKey: string, baseUrl?: string, timeout?: number) {
    super('OpenAI')
    const timeoutMs = timeout || 120000
    this.log('info', 'Initializing', { baseUrl: baseUrl || 'default', timeout: timeoutMs })
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
      timeout: timeoutMs,
      maxRetries: 0,
    })
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

  private convertTools(tools?: ToolDefinition[]): OpenAI.ChatCompletionTool[] | undefined {
    if (!tools?.length) return undefined
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }))
  }

  async chat(params: ChatParams): Promise<void> {
    const {
      model,
      messages,
      tools,
      systemPrompt,
      maxTokens,
      signal,
      thinkingEnabled,
      thinkingBudget,
      onStream,
      onToolCall,
      onComplete,
      onError,
    } = params

    try {
      this.log('info', 'Starting chat', { model, messageCount: messages.length })

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

      const convertedTools = this.convertTools(tools)

      // 构建请求体，使用 any 以支持扩展参数（如 reasoning_effort）
      const requestBody: Record<string, unknown> = {
        model,
        messages: openaiMessages,
        stream: true,
        max_tokens: maxTokens || 8192,
      }

      if (convertedTools && convertedTools.length > 0) {
        requestBody.tools = convertedTools
      }

      // Thinking/Reasoning 模式支持
      // DeepSeek: reasoning_effort 参数
      // 其他兼容 API 可能使用不同字段
      if (thinkingEnabled) {
        // DeepSeek R1 使用 reasoning_effort
        requestBody.reasoning_effort = 'medium'  // low/medium/high
        this.log('info', 'Thinking mode enabled', { budget: thinkingBudget })
      }

      const stream = await this.client.chat.completions.create(
        requestBody as unknown as OpenAI.ChatCompletionCreateParamsStreaming,
        { signal }
      )

      let fullContent = ''
      let fullReasoning = ''
      const toolCalls: ToolCall[] = []
      let currentToolCall: { id?: string; name?: string; argsString: string } | null = null

      for await (const chunk of stream) {
        interface ExtendedDelta {
          content?: string
          reasoning?: string
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

        if (delta?.reasoning) {
          fullReasoning += delta.reasoning
          onStream({ type: 'reasoning', content: delta.reasoning })
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
      this.log('info', 'Chat complete', {
        contentLength: fullContent.length,
        toolCallCount: toolCalls.length,
      })

      onComplete({
        content: finalContent,
        reasoning: fullReasoning || undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      })
    } catch (error: unknown) {
      const llmError = this.parseError(error)
      this.log('error', 'Chat failed', { code: llmError.code, message: llmError.message })
      onError(llmError)
    }
  }

  private finalizeToolCall(tc: {
    id?: string
    name?: string
    argsString: string
  }): ToolCall | null {
    if (!tc.id || !tc.name) return null

    let argsStr = tc.argsString || '{}'
    argsStr = this.cleanToolCallArgs(argsStr)

    try {
      const args = JSON.parse(argsStr)
      return { id: tc.id, name: tc.name, arguments: args }
    } catch {
      try {
        const fixed = this.fixUnescapedNewlines(argsStr)
        const args = JSON.parse(fixed)
        return { id: tc.id, name: tc.name, arguments: args }
      } catch {
        try {
          const fixed = this.fixMalformedJson(argsStr)
          const args = JSON.parse(fixed)
          return { id: tc.id, name: tc.name, arguments: args }
        } catch {
          this.log('error', 'Failed to parse tool call arguments')
          return null
        }
      }
    }
  }

  private cleanToolCallArgs(argsStr: string): string {
    let cleaned = argsStr.trimStart()
    cleaned = cleaned.replace(/<\|[^|]+\|>/g, '')
    cleaned = cleaned.trimEnd()

    if (cleaned.length > 0 && !cleaned.endsWith('}')) {
      let braceCount = 0
      let lastValidEnd = -1
      let inString = false
      let escaped = false

      for (let i = 0; i < cleaned.length; i++) {
        const char = cleaned[i]
        if (escaped) {
          escaped = false
          continue
        }
        if (char === '\\' && inString) {
          escaped = true
          continue
        }
        if (char === '"') {
          inString = !inString
          continue
        }
        if (!inString) {
          if (char === '{') braceCount++
          else if (char === '}') {
            braceCount--
            if (braceCount === 0) lastValidEnd = i
          }
        }
      }

      if (lastValidEnd !== -1) {
        cleaned = cleaned.slice(0, lastValidEnd + 1)
      }
    }

    return cleaned
  }

  private fixUnescapedNewlines(argsStr: string): string {
    let inString = false
    let escaped = false
    let result = ''

    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i]
      const charCode = char.charCodeAt(0)

      if (escaped) {
        result += char
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        result += char
        continue
      }
      if (char === '"') {
        inString = !inString
        result += char
        continue
      }

      if (inString) {
        if (char === '\n') {
          result += '\\n'
          continue
        }
        if (char === '\r') {
          result += '\\r'
          continue
        }
        if (char === '\t') {
          result += '\\t'
          continue
        }
        if (charCode < 32) {
          result += `\\u${charCode.toString(16).padStart(4, '0')}`
          continue
        }
      }

      result += char
    }

    return result
  }

  private fixMalformedJson(argsStr: string): string {
    let result = ''
    let inString = false
    let escaped = false
    let i = 0

    while (i < argsStr.length) {
      const char = argsStr[i]
      const charCode = char.charCodeAt(0)

      if (escaped) {
        result += char
        escaped = false
        i++
        continue
      }
      if (char === '\\') {
        escaped = true
        result += char
        i++
        continue
      }
      if (char === '"') {
        inString = !inString
        result += char
        i++
        continue
      }

      if (inString) {
        if (char === '\n') result += '\\n'
        else if (char === '\r') result += '\\r'
        else if (char === '\t') result += '\\t'
        else if (charCode < 32) result += `\\u${charCode.toString(16).padStart(4, '0')}`
        else result += char
      } else {
        result += char
      }

      i++
    }

    if (inString) result += '"'

    let braceCount = 0
    let bracketCount = 0
    inString = false
    escaped = false

    for (let j = 0; j < result.length; j++) {
      const c = result[j]
      if (escaped) {
        escaped = false
        continue
      }
      if (c === '\\') {
        escaped = true
        continue
      }
      if (c === '"') {
        inString = !inString
        continue
      }
      if (!inString) {
        if (c === '{') braceCount++
        else if (c === '}') braceCount--
        else if (c === '[') bracketCount++
        else if (c === ']') bracketCount--
      }
    }

    while (bracketCount > 0) {
      result += ']'
      bracketCount--
    }
    while (braceCount > 0) {
      result += '}'
      braceCount--
    }

    return result
  }
}
