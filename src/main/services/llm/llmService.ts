/**
 * LLM 服务 - 统一入口
 * 
 * 职责：
 * - 提供统一的 LLM 服务接口
 * - 协调各个子服务（流式、同步、结构化、Agent）
 * - 管理请求生命周期
 */

import { BrowserWindow } from 'electron'
import { StreamingService } from './StreamingService'
import { SyncService } from './SyncService'
import { StructuredService } from './StructuredService'
import type { LLMConfig, LLMMessage, ToolDefinition } from '@shared/types'
import type { CodeAnalysis, Refactoring, CodeFix, TestCase } from './StructuredService'

export class LLMService {
  private streamingService: StreamingService
  private syncService: SyncService
  private structuredService: StructuredService
  private currentAbortController: AbortController | null = null

  constructor(window: BrowserWindow) {
    this.streamingService = new StreamingService(window)
    this.syncService = new SyncService()
    this.structuredService = new StructuredService()
  }

  // ============================================
  // 流式生成
  // ============================================

  /**
   * 发送消息（流式响应）
   */
  async sendMessage(params: {
    config: LLMConfig
    messages: LLMMessage[]
    tools?: ToolDefinition[]
    systemPrompt?: string
  }) {
    this.currentAbortController = new AbortController()

    try {
      return await this.streamingService.generate({
        ...params,
        abortSignal: this.currentAbortController.signal,
      })
    } finally {
      this.currentAbortController = null
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

  // ============================================
  // 同步生成
  // ============================================

  /**
   * 同步发送消息（用于后台任务）
   */
  async sendMessageSync(params: {
    config: LLMConfig
    messages: LLMMessage[]
    tools?: ToolDefinition[]
    systemPrompt?: string
  }): Promise<{ content: string; error?: string }> {
    return await this.syncService.generate(params)
  }

  // ============================================
  // 结构化输出
  // ============================================

  /**
   * 代码分析
   */
  async analyzeCode(params: {
    config: LLMConfig
    code: string
    language: string
    filePath: string
  }): Promise<CodeAnalysis> {
    return await this.structuredService.analyzeCode(params)
  }

  /**
   * 代码重构建议
   */
  async suggestRefactoring(params: {
    config: LLMConfig
    code: string
    language: string
    intent: string
  }): Promise<Refactoring> {
    return await this.structuredService.suggestRefactoring(params)
  }

  /**
   * 错误修复建议
   */
  async suggestFixes(params: {
    config: LLMConfig
    code: string
    language: string
    diagnostics: Array<{
      message: string
      line: number
      column: number
      severity: number
    }>
  }): Promise<CodeFix> {
    return await this.structuredService.suggestFixes(params)
  }

  /**
   * 生成测试用例
   */
  async generateTests(params: {
    config: LLMConfig
    code: string
    language: string
    framework?: string
  }): Promise<TestCase> {
    return await this.structuredService.generateTests(params)
  }

  /**
   * 流式代码分析
   */
  async analyzeCodeStream(
    params: {
      config: LLMConfig
      code: string
      language: string
      filePath: string
    },
    onPartial: (partial: unknown) => void
  ): Promise<CodeAnalysis> {
    return await this.structuredService.analyzeCodeStream(params, onPartial)
  }

  // ============================================
  // 生命周期
  // ============================================

  /**
   * 销毁服务
   */
  destroy() {
    this.abort()
  }
}

// 导出类型
export type {
  CodeAnalysis,
  Refactoring,
  CodeFix,
  TestCase,
}
