/**
 * LLM 服务导出
 */

export { LLMService } from './llmService'
export { createModel, type ModelOptions } from './modelFactory'

// 重新导出共享类型
export type {
    ProviderType,
    LLMConfig,
    LLMMessage,
    LLMToolCall,
    LLMToolCallMessage,
    LLMStreamChunk,
    LLMResult,
    ToolDefinition,
    ToolPropertySchema,
    TextContent,
    ImageContent,
    MessageContent,
    MessageContentPart,
} from '@/shared/types'

export { LLMErrorCode } from '@/shared/types'
