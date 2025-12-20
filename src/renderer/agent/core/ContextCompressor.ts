/**
 * 上下文压缩服务
 * 当对话历史过长时，使用 LLM 生成摘要以压缩上下文
 * 参考 Claude Code 的 PreCompact 机制
 */

import { ChatMessage, isAssistantMessage, isTextPart, TextContent, ToolCallPart } from './types'

// 压缩配置
export const COMPACT_CONFIG = {
    // 触发压缩的消息数阈值
    messageThreshold: 30,
    // 触发压缩的字符数阈值
    charThreshold: 40000,
    // 压缩后保留的最近消息数
    keepRecentMessages: 6,
    // 摘要最大字符数
    maxSummaryChars: 2000,
} as const

// 可压缩的消息类型（排除 checkpoint）
type CompactableMessage = Exclude<ChatMessage, { role: 'checkpoint' }>

/**
 * 检查消息是否可压缩（排除 checkpoint）
 */
function isCompactableMessage(msg: ChatMessage): msg is CompactableMessage {
    return msg.role !== 'checkpoint'
}

/**
 * 从消息中安全提取文本内容
 */
function getMessageTextContent(msg: CompactableMessage): string {
    if (!('content' in msg)) return ''
    const content = msg.content
    if (typeof content === 'string') {
        return content
    }
    if (Array.isArray(content)) {
        return content
            .filter((p): p is TextContent => p.type === 'text')
            .map(p => p.text)
            .join('\n')
    }
    return ''
}

/**
 * 检查是否需要压缩上下文
 */
export function shouldCompactContext(messages: ChatMessage[]): boolean {
    // 过滤掉 checkpoint 消息
    const compactable = messages.filter(isCompactableMessage)

    // 检查消息数量
    if (compactable.length > COMPACT_CONFIG.messageThreshold) {
        return true
    }

    // 检查总字符数
    const totalChars = compactable.reduce((sum, msg) => {
        return sum + getMessageTextContent(msg).length
    }, 0)

    return totalChars > COMPACT_CONFIG.charThreshold
}

/**
 * 构建用于生成摘要的提示词
 */
export function buildCompactPrompt(messages: ChatMessage[]): string {
    const compactable = messages.filter(isCompactableMessage)

    // 构建对话历史摘要
    const conversationHistory = compactable.map((msg) => {
        const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'Tool'
        const content = getMessageTextContent(msg)

        // 对于工具结果，只显示简短摘要
        if (msg.role === 'tool') {
            const toolName = msg.name || 'unknown'
            const truncated = content.length > 200 ? content.slice(0, 200) + '...' : content
            return `[${role}] (${toolName}): ${truncated}`
        }

        // 对于助手消息，检查工具调用
        if (isAssistantMessage(msg) && msg.parts) {
            const toolCalls = msg.parts
                .filter((p): p is ToolCallPart => p.type === 'tool_call')
                .map(p => p.toolCall.name || 'tool')
            if (toolCalls.length > 0) {
                const textContent = msg.parts
                    .filter(isTextPart)
                    .map(p => p.content)
                    .join('\n')
                return `[${role}] Used tools: ${toolCalls.join(', ')}. ${textContent.slice(0, 300)}`
            }
        }

        // 普通消息截断
        const truncated = content.length > 500 ? content.slice(0, 500) + '...' : content
        return `[${role}]: ${truncated}`
    }).join('\n\n')

    return `Please summarize the following conversation history into a concise summary (max ${COMPACT_CONFIG.maxSummaryChars} chars).
Focus on:
1. The user's main requests and goals
2. Key decisions made
3. Files that were modified
4. Important context that should be preserved

Conversation History:
${conversationHistory}

Summary:`
}

/**
 * 将消息历史压缩为摘要 + 最近消息
 */
export interface CompactedContext {
    summary: string
    recentMessages: ChatMessage[]
    compactedCount: number
}

/**
 * 准备待压缩的消息（不包括最近的消息）
 */
export function prepareMessagesForCompact(messages: ChatMessage[]): {
    messagesToCompact: ChatMessage[]
    recentMessages: ChatMessage[]
} {
    const keepCount = COMPACT_CONFIG.keepRecentMessages

    if (messages.length <= keepCount) {
        return {
            messagesToCompact: [],
            recentMessages: messages,
        }
    }

    return {
        messagesToCompact: messages.slice(0, -keepCount),
        recentMessages: messages.slice(-keepCount),
    }
}

/**
 * 创建压缩后的系统消息
 */
export function createCompactedSystemMessage(summary: string): string {
    return `## Conversation Summary

The following is a summary of the earlier conversation:

${summary}

---

Continue the conversation based on the above context.`
}
