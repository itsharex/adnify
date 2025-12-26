/**
 * 消息构建服务
 * 负责构建发送给 LLM 的消息，包括上下文处理和历史消息管理
 * 从 AgentService 拆分出来，专注于消息构建职责
 */

import { logger } from '@utils/Logger'
import { useAgentStore } from './AgentStore'
import { buildOpenAIMessages, validateOpenAIMessages, OpenAIMessage } from './MessageConverter'
import { MessageContent } from './types'
import { truncateToolResult } from '@/renderer/utils/partialJson'
import { getAgentConfig } from './AgentConfig'
import {
  shouldCompactContext,
  prepareMessagesForCompact,
  createCompactedSystemMessage,
  calculateSavings,
} from './ContextCompressor'

// 从 ContextBuilder 导入已有的函数
export { buildContextContent, buildUserContent, calculateContextStats } from './ContextBuilder'

/**
 * 构建发送给 LLM 的消息列表
 */
export async function buildLLMMessages(
  currentMessage: MessageContent,
  contextContent: string,
  systemPrompt: string
): Promise<OpenAIMessage[]> {
  const store = useAgentStore.getState()
  const historyMessages = store.getMessages()

  // 从 ContextBuilder 导入 buildUserContent
  const { buildUserContent } = await import('./ContextBuilder')

  // 过滤掉 checkpoint 消息
  type NonCheckpointMessage = Exclude<typeof historyMessages[number], { role: 'checkpoint' }>
  let filteredMessages: NonCheckpointMessage[] = historyMessages.filter(
    (m): m is NonCheckpointMessage => m.role !== 'checkpoint'
  )

  let compactedSummary: string | null = null
  const llmConfig = getAgentConfig()

  // 检查是否需要压缩上下文
  if (shouldCompactContext(filteredMessages)) {
    logger.agent.info('[MessageBuilder] Context exceeds threshold, compacting...')

    const existingSummary = (store as any).contextSummary
    if (existingSummary) {
      compactedSummary = existingSummary
      const { recentMessages, messagesToCompact } = prepareMessagesForCompact(filteredMessages as any)
      
      // 计算并记录压缩节省的 Token 数
      const savings = calculateSavings(messagesToCompact as any, existingSummary)
      logger.agent.info(`[MessageBuilder] Context compression: saved ${savings.savedTokens} tokens (${savings.savedPercent}%)`)
      
      filteredMessages = recentMessages as NonCheckpointMessage[]
    } else {
      filteredMessages = filteredMessages.slice(-llmConfig.maxHistoryMessages)
    }
  } else {
    filteredMessages = filteredMessages.slice(-llmConfig.maxHistoryMessages)
  }

  // 构建系统提示
  const effectiveSystemPrompt = compactedSummary
    ? `${systemPrompt}\n\n${createCompactedSystemMessage(compactedSummary)}`
    : systemPrompt

  // 转换为 OpenAI 格式
  const openaiMessages = buildOpenAIMessages(filteredMessages as any, effectiveSystemPrompt)

  // 截断过长的工具结果
  for (const msg of openaiMessages) {
    if (msg.role === 'tool' && typeof msg.content === 'string') {
      if (msg.content.length > llmConfig.maxToolResultChars) {
        msg.content = truncateToolResult(msg.content, 'default', llmConfig.maxToolResultChars)
      }
    }
  }

  // 添加当前用户消息
  const userContent = buildUserContent(currentMessage, contextContent)
  openaiMessages.push({ role: 'user', content: userContent as any })

  // 验证消息格式
  const validation = validateOpenAIMessages(openaiMessages)
  if (!validation.valid) {
    logger.agent.warn('[MessageBuilder] Message validation warning:', validation.error)
  }

  return openaiMessages
}

/**
 * 压缩上下文（移除旧的工具结果）
 */
export async function compressContext(
  messages: OpenAIMessage[],
  maxChars: number
): Promise<void> {
  let totalChars = 0

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      totalChars += msg.content.length
    } else if (Array.isArray(msg.content)) {
      totalChars += 1000 // 估算多模态内容
    }
  }

  if (totalChars <= maxChars) return

  logger.agent.info(`[MessageBuilder] Context size ${totalChars} exceeds limit ${maxChars}, compressing...`)

  // 找到最近 3 轮用户消息的位置
  let userCount = 0
  let cutOffIndex = messages.length

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      userCount++
      if (userCount === 3) {
        cutOffIndex = i
        break
      }
    }
  }

  // 压缩早期消息
  for (let i = 0; i < cutOffIndex; i++) {
    const msg = messages[i]

    // 移除旧的工具输出
    if (msg.role === 'tool' && typeof msg.content === 'string' && msg.content.length > 100) {
      msg.content = '[Tool output removed to save context]'
    }

    // 截断旧的助手消息
    if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.length > 500) {
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        msg.content = msg.content.slice(0, 200) + '\n...[Content truncated]...\n' + msg.content.slice(-200)
      }
    }
  }
}
