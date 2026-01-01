/**
 * 工具注册表
 * 
 * 职责：
 * - 注册工具执行器
 * - 验证工具参数
 * - 执行工具
 * 
 * 注意：工具的按需加载由 BuiltinToolProvider + toolGroups 负责
 */

import { z } from 'zod'
import { logger } from '@utils/Logger'
import { TOOL_SCHEMAS, TOOL_DEFINITIONS, TOOL_CONFIGS, type ToolCategory } from '@/shared/config/tools'
import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolExecutionContext,
  ToolExecutor,
  ValidationResult,
  ToolApprovalType,
} from '@/shared/types'

// ===== 类型 =====

interface RegisteredTool {
  name: string
  definition: ToolDefinition
  schema: z.ZodSchema
  executor: ToolExecutor
  category: ToolCategory
  approvalType: ToolApprovalType
  parallel: boolean
  enabled: boolean
}

// ===== 注册表 =====

class ToolRegistry {
  private tools = new Map<string, RegisteredTool>()
  private initialized = false

  /**
   * 注册工具
   */
  register(name: string, executor: ToolExecutor, options?: { override?: boolean }): boolean {
    if (this.tools.has(name) && !options?.override) return false

    const definition = TOOL_DEFINITIONS[name]
    const schema = TOOL_SCHEMAS[name]
    const config = TOOL_CONFIGS[name]

    if (!definition || !schema) {
      logger.agent.warn(`[ToolRegistry] Missing definition or schema for: ${name}`)
      return false
    }

    this.tools.set(name, {
      name,
      definition,
      schema,
      executor,
      category: config?.category || 'read',
      approvalType: config?.approvalType || 'none',
      parallel: config?.parallel ?? false,
      enabled: true,
    })

    return true
  }

  /**
   * 批量注册工具
   */
  registerAll(executors: Record<string, ToolExecutor>): void {
    for (const [name, executor] of Object.entries(executors)) {
      this.register(name, executor, { override: true })
    }
    this.initialized = true
    logger.agent.info(`[ToolRegistry] Registered ${this.tools.size} tools`)
  }

  isInitialized(): boolean {
    return this.initialized
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  /**
   * 获取所有已注册的工具
   */
  getAll(): RegisteredTool[] {
    return Array.from(this.tools.values()).filter(t => t.enabled)
  }

  getApprovalType(name: string): ToolApprovalType {
    return this.tools.get(name)?.approvalType || 'none'
  }

  /**
   * 验证工具参数
   */
  validate<T = unknown>(name: string, args: unknown): ValidationResult<T> {
    const tool = this.tools.get(name)
    if (!tool) return { success: false, error: `Unknown tool: ${name}` }

    const result = tool.schema.safeParse(args)
    if (result.success) return { success: true, data: result.data as T }

    const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    return { success: false, error: `Invalid parameters: ${errors}` }
  }

  /**
   * 执行工具
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name)
    if (!tool) return { success: false, result: '', error: `Unknown tool: ${name}` }
    if (!tool.enabled) return { success: false, result: '', error: `Tool "${name}" is disabled` }

    const validation = this.validate(name, args)
    if (!validation.success) {
      return { success: false, result: '', error: `Validation failed: ${validation.error}` }
    }

    try {
      return await tool.executor(validation.data as Record<string, unknown>, context)
    } catch (error: any) {
      return { success: false, result: '', error: `Execution error: ${error.message}` }
    }
  }

  setEnabled(name: string, enabled: boolean): boolean {
    const tool = this.tools.get(name)
    if (!tool) return false
    tool.enabled = enabled
    return true
  }
}

export const toolRegistry = new ToolRegistry()
