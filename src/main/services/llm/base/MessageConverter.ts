/**
 * 消息转换器 - 统一处理消息格式转换
 * 
 * 职责：
 * - 将应用层消息格式转换为 AI SDK CoreMessage 格式
 * - 处理多模态内容（文本、图片）
 * - 处理工具调用和工具结果
 */

import { logger } from '@shared/utils/Logger'
import type { LLMMessage, MessageContentPart } from '@shared/types'

export class MessageConverter {
  /**
   * 转换消息为 AI SDK 兼容格式
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  convert(messages: LLMMessage[], systemPrompt?: string): any[] {
    const result: any[] = []

    // 添加 system prompt
    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt })
    }

    for (const msg of messages) {
      const converted = this.convertMessage(msg)
      if (converted) {
        result.push(converted)
      }
    }

    return result
  }

  /**
   * 转换单条消息
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertMessage(msg: LLMMessage): any | null {
    switch (msg.role) {
      case 'system':
        return this.convertSystemMessage(msg)
      case 'user':
        return this.convertUserMessage(msg)
      case 'assistant':
        return this.convertAssistantMessage(msg)
      case 'tool':
        return this.convertToolMessage(msg)
      default:
        return null
    }
  }

  /**
   * 转换系统消息
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertSystemMessage(msg: LLMMessage): any {
    return {
      role: 'system',
      content: this.extractTextContent(msg.content),
    }
  }

  /**
   * 转换用户消息
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertUserMessage(msg: LLMMessage): any | null {
    if (typeof msg.content === 'string') {
      return msg.content.trim() ? { role: 'user', content: msg.content } : null
    }

    if (Array.isArray(msg.content)) {
      const parts = this.convertUserContentParts(msg.content)
      return parts.length > 0 ? { role: 'user', content: parts } : null
    }

    return null
  }

  /**
   * 转换用户消息内容部分（多模态）
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertUserContentParts(content: MessageContentPart[]): any[] {
    const parts: any[] = []

    for (const item of content) {
      if (!item || typeof item !== 'object' || !('type' in item)) continue

      if (item.type === 'text' && 'text' in item && item.text) {
        parts.push({ type: 'text', text: item.text })
      } else if (item.type === 'image' && 'source' in item) {
        const imageUrl = this.convertImageSource(item.source as any)
        if (imageUrl) {
          parts.push({ type: 'image', image: imageUrl })
        }
      }
    }

    return parts
  }

  /**
   * 转换图片源
   */
  private convertImageSource(source: { type: string; media_type: string; data: string }): string | null {
    if (!source?.data) return null

    return source.type === 'url'
      ? source.data
      : `data:${source.media_type};base64,${source.data}`
  }

  /**
   * 转换助手消息
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertAssistantMessage(msg: LLMMessage): any | null {
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const content = this.convertAssistantWithToolCalls(msg)
      return content.length > 0 ? { role: 'assistant', content } : null
    }

    const textContent = this.extractTextContent(msg.content)
    return textContent ? { role: 'assistant', content: textContent } : null
  }

  /**
   * 转换包含工具调用的助手消息
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      } catch (error) {
        logger.llm.warn('[MessageConverter] Skipping invalid tool call:', tc.id, error)
      }
    }

    return content
  }

  /**
   * 转换工具结果消息
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertToolMessage(msg: LLMMessage): any | null {
    if (!msg.tool_call_id) return null

    return {
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
    }
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
}
