/**
 * 上下文压缩服务测试
 */

import { describe, it, expect } from 'vitest'
import {
  shouldCompactContext,
  prepareMessagesForCompact,
  buildCompactPrompt,
  createCompactedSystemMessage,
  COMPACT_CONFIG,
} from '../../src/renderer/agent/core/ContextCompressor'
import { ChatMessage, UserMessage, AssistantMessage, ToolResultMessage } from '../../src/renderer/agent/core/types'

// 辅助函数：创建测试消息
function createUserMessage(content: string, id = 'user-1'): UserMessage {
  return {
    id,
    role: 'user',
    content,
    timestamp: Date.now(),
  }
}

function createAssistantMessage(content: string, id = 'assistant-1'): AssistantMessage {
  return {
    id,
    role: 'assistant',
    content,
    timestamp: Date.now(),
    parts: [{ type: 'text', content }],
  }
}

function createToolMessage(content: string, id = 'tool-1'): ToolResultMessage {
  return {
    id,
    role: 'tool',
    toolCallId: 'tc-1',
    name: 'read_file',
    content,
    timestamp: Date.now(),
    type: 'success',
  }
}

describe('shouldCompactContext', () => {
  it('should return false for few messages', () => {
    const messages: ChatMessage[] = [
      createUserMessage('Hello'),
      createAssistantMessage('Hi there!'),
    ]
    expect(shouldCompactContext(messages)).toBe(false)
  })

  it('should return true when message count exceeds threshold', () => {
    const messages: ChatMessage[] = []
    for (let i = 0; i < COMPACT_CONFIG.messageThreshold + 5; i++) {
      messages.push(createUserMessage(`Message ${i}`, `user-${i}`))
      messages.push(createAssistantMessage(`Response ${i}`, `assistant-${i}`))
    }
    expect(shouldCompactContext(messages)).toBe(true)
  })

  it('should return true when char count exceeds threshold', () => {
    const longContent = 'x'.repeat(COMPACT_CONFIG.charThreshold + 1000)
    const messages: ChatMessage[] = [
      createUserMessage(longContent),
    ]
    expect(shouldCompactContext(messages)).toBe(true)
  })

  it('should ignore checkpoint messages', () => {
    const messages: ChatMessage[] = [
      createUserMessage('Hello'),
      {
        id: 'checkpoint-1',
        role: 'checkpoint',
        type: 'user_message',
        timestamp: Date.now(),
        fileSnapshots: {},
      },
      createAssistantMessage('Hi!'),
    ]
    expect(shouldCompactContext(messages)).toBe(false)
  })
})

describe('prepareMessagesForCompact', () => {
  it('should keep recent messages', () => {
    const messages: ChatMessage[] = []
    for (let i = 0; i < 20; i++) {
      messages.push(createUserMessage(`Message ${i}`, `user-${i}`))
    }

    const { messagesToCompact, recentMessages, importantMessages } = prepareMessagesForCompact(messages)

    expect(recentMessages.length).toBe(COMPACT_CONFIG.keepRecentMessages)
    // 用户消息被标记为重要，所以会进入 importantMessages
    expect(messagesToCompact.length + importantMessages.length).toBe(20 - COMPACT_CONFIG.keepRecentMessages)
  })

  it('should return all messages as recent if below threshold', () => {
    const messages: ChatMessage[] = [
      createUserMessage('Hello'),
      createAssistantMessage('Hi!'),
    ]

    const { messagesToCompact, recentMessages } = prepareMessagesForCompact(messages)

    expect(recentMessages.length).toBe(2)
    expect(messagesToCompact.length).toBe(0)
  })

  it('should preserve message order', () => {
    const messages: ChatMessage[] = []
    for (let i = 0; i < 10; i++) {
      messages.push(createUserMessage(`Message ${i}`, `user-${i}`))
    }

    const { recentMessages } = prepareMessagesForCompact(messages)

    // 最后几条消息应该保持顺序
    const lastIndex = messages.length - 1
    expect((recentMessages[recentMessages.length - 1] as UserMessage).content).toBe(`Message ${lastIndex}`)
  })
})

describe('buildCompactPrompt', () => {
  it('should include conversation history', () => {
    const messages: ChatMessage[] = [
      createUserMessage('What is TypeScript?'),
      createAssistantMessage('TypeScript is a typed superset of JavaScript.'),
    ]

    const prompt = buildCompactPrompt(messages)

    expect(prompt).toContain('What is TypeScript?')
    expect(prompt).toContain('TypeScript is a typed superset of JavaScript')
    expect(prompt).toContain('[User]')
    expect(prompt).toContain('[Assistant]')
  })

  it('should truncate long messages', () => {
    const longContent = 'x'.repeat(1000)
    const messages: ChatMessage[] = [
      createUserMessage(longContent),
    ]

    const prompt = buildCompactPrompt(messages)

    expect(prompt.length).toBeLessThan(longContent.length + 500)
    expect(prompt).toContain('...')
  })

  it('should handle tool messages', () => {
    const messages: ChatMessage[] = [
      createToolMessage('File content here'),
    ]

    const prompt = buildCompactPrompt(messages)

    expect(prompt).toContain('[Tool]')
    // Tool 消息不包含工具名称在 prompt 中，只显示内容
    expect(prompt).toContain('File content here')
  })

  it('should include summary instructions', () => {
    const messages: ChatMessage[] = [
      createUserMessage('Hello'),
    ]

    const prompt = buildCompactPrompt(messages)

    expect(prompt).toContain('summarize')
    expect(prompt).toContain(String(COMPACT_CONFIG.maxSummaryChars))
  })
})

describe('createCompactedSystemMessage', () => {
  it('should create system message with summary', () => {
    const summary = 'User asked about TypeScript. We discussed type safety.'
    const message = createCompactedSystemMessage(summary)

    expect(message).toContain('Conversation Summary')
    expect(message).toContain(summary)
    expect(message).toContain('Continue the conversation')
  })
})
