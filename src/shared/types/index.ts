/**
 * 共享类型定义
 * 主进程和渲染进程共用的类型
 */

// ==========================================
// 基础类型
// ==========================================

export interface FileItem {
  name: string
  path: string
  isDirectory: boolean
  isRoot?: boolean
  children?: FileItem[]
  lastModified?: number
  size?: number
}

export interface FileSnapshot {
  fsPath: string
  content: string | null
}

// ==========================================
// LLM 相关类型
// ==========================================

export type MessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64' | 'url'; media_type: string; data: string } }

export type MessageContent = string | MessageContentPart[]

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: MessageContent
  tool_calls?: LLMToolCallMessage[]
  tool_call_id?: string
  name?: string
}

export interface LLMToolCallMessage {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface LLMStreamChunk {
  type: 'text' | 'tool_call' | 'tool_call_start' | 'tool_call_delta' | 'tool_call_end' | 'reasoning' | 'error'
  content?: string
  toolCall?: LLMToolCall
  toolCallDelta?: {
    id?: string
    name?: string
    args?: string
  }
  error?: string
}

export interface LLMToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface LLMResult {
  content: string
  reasoning?: string
  toolCalls?: LLMToolCall[]
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface LLMError {
  message: string
  code: string
  retryable: boolean
}

export interface LLMConfig {
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
  timeout?: number
  maxTokens?: number
}

export interface ToolDefinition {
  name: string
  description: string
  approvalType?: ToolApprovalType
  parameters: {
    type: 'object'
    properties: Record<string, {
      type: string
      description: string
      enum?: string[]
    }>
    required?: string[]
  }
}

export interface LLMSendMessageParams {
  config: LLMConfig
  messages: LLMMessage[]
  tools?: ToolDefinition[]
  systemPrompt?: string
}

// ==========================================
// 工具相关类型
// ==========================================

export type ToolStatus = 'pending' | 'awaiting' | 'running' | 'success' | 'error' | 'rejected'
// edits 已移除 - 文件编辑不需要确认（可通过 Checkpoint 撤销）
export type ToolApprovalType = 'terminal' | 'dangerous'
export type ToolResultType = 'success' | 'tool_error' | 'rejected'

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  status: ToolStatus
  result?: string
  error?: string
}

export interface ToolExecutionResult {
  success: boolean
  result: string
  error?: string
  meta?: {
    filePath?: string
    oldContent?: string
    newContent?: string
    linesAdded?: number
    linesRemoved?: number
    isNewFile?: boolean
  }
}

// ==========================================
// 搜索相关类型
// ==========================================

export interface SearchFilesOptions {
  isRegex: boolean
  isCaseSensitive: boolean
  isWholeWord: boolean
  include?: string
  exclude?: string
}

export interface SearchFileResult {
  path: string
  line: number
  text: string
}

// ==========================================
// 索引相关类型
// ==========================================

export type EmbeddingProviderType = 'jina' | 'voyage' | 'openai' | 'cohere' | 'huggingface' | 'ollama'

export interface EmbeddingConfig {
  provider?: EmbeddingProviderType
  apiKey?: string
  model?: string
  baseUrl?: string
}

export interface IndexStatus {
  isIndexing: boolean
  totalFiles: number
  indexedFiles: number
  totalChunks: number
  lastIndexedAt?: number
  error?: string
}

export interface IndexSearchResult {
  filePath: string
  relativePath: string
  content: string
  startLine: number
  endLine: number
  score: number
  type: string
  language: string
}

export interface EmbeddingProvider {
  id: string
  name: string
  description: string
  free: boolean
}

// ==========================================
// LSP 相关类型
// ==========================================

export interface LspPosition {
  line: number
  character: number
}

export interface LspRange {
  start: LspPosition
  end: LspPosition
}

export interface LspLocation {
  uri: string
  range: LspRange
}

export interface LspDiagnostic {
  range: LspRange
  severity?: number
  code?: string | number
  source?: string
  message: string
}

export interface LspHover {
  contents: string | { kind: string; value: string } | Array<string | { kind: string; value: string }>
  range?: LspRange
}

export interface LspCompletionItem {
  label: string
  kind?: number
  detail?: string
  documentation?: string | { kind: string; value: string }
  insertText?: string
  insertTextFormat?: number
}

export interface LspCompletionList {
  isIncomplete: boolean
  items: LspCompletionItem[]
}

export interface LspTextEdit {
  range: LspRange
  newText: string
}

export interface LspWorkspaceEdit {
  changes?: { [uri: string]: LspTextEdit[] }
  documentChanges?: Array<{ textDocument: { uri: string; version?: number }; edits: LspTextEdit[] }>
}

export interface LspSignatureHelp {
  signatures: LspSignatureInformation[]
  activeSignature?: number
  activeParameter?: number
}

export interface LspSignatureInformation {
  label: string
  documentation?: string | { kind: string; value: string }
  parameters?: LspParameterInformation[]
}

export interface LspParameterInformation {
  label: string | [number, number]
  documentation?: string | { kind: string; value: string }
}

export interface LspDocumentSymbol {
  name: string
  detail?: string
  kind: number
  range: LspRange
  selectionRange: LspRange
  children?: LspDocumentSymbol[]
}

export interface LspSymbolInformation {
  name: string
  kind: number
  location: LspLocation
  containerName?: string
}

export interface LspCodeAction {
  title: string
  kind?: string
  diagnostics?: LspDiagnostic[]
  isPreferred?: boolean
  edit?: LspWorkspaceEdit
  command?: { title: string; command: string; arguments?: unknown[] }
}

export interface LspFormattingOptions {
  tabSize?: number
  insertSpaces?: boolean
}

export interface LspDocumentHighlight {
  range: LspRange
  kind?: number
}

export interface LspFoldingRange {
  startLine: number
  startCharacter?: number
  endLine: number
  endCharacter?: number
  kind?: string
}

export interface LspInlayHint {
  position: LspPosition
  label: string | { value: string; tooltip?: string }[]
  kind?: number
  paddingLeft?: boolean
  paddingRight?: boolean
}

export interface LspPrepareRename {
  range: LspRange
  placeholder: string
}
