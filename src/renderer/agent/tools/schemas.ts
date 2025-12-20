/**
 * 工具参数 Zod Schema 定义
 * 运行时参数校验，提高工具调用精准度
 */

import { z } from 'zod'

// ===== 文件操作工具 =====

export const ReadFileSchema = z.object({
    path: z.string().min(1, 'File path is required'),
    start_line: z.number().int().positive().optional(),
    end_line: z.number().int().positive().optional()
}).refine(
    data => !data.start_line || !data.end_line || data.start_line <= data.end_line,
    { message: 'start_line must be <= end_line' }
)

export const ListDirectorySchema = z.object({
    path: z.string().min(1, 'Directory path is required')
})

export const GetDirTreeSchema = z.object({
    path: z.string().min(1, 'Directory path is required'),
    max_depth: z.number().int().min(1).max(10).optional().default(3)
})

export const SearchFilesSchema = z.object({
    path: z.string().min(1, 'Search path is required'),
    pattern: z.string().min(1, 'Search pattern is required'),
    is_regex: z.boolean().optional().default(false),
    file_pattern: z.string().optional()
})

export const ReadMultipleFilesSchema = z.object({
    paths: z.array(z.string().min(1)).min(1, 'At least one file path is required')
})

// ===== 文件编辑工具 =====

export const EditFileSchema = z.object({
    path: z.string().min(1, 'File path is required'),
    search_replace_blocks: z.string().min(1, 'SEARCH/REPLACE blocks are required')
}).refine(
    data => {
        const blocks = data.search_replace_blocks
        // 更宽容的验证：检查是否包含 SEARCH/REPLACE 标记（忽略空格变体）
        const hasSearch = /<<<+\s*SEARCH/i.test(blocks)
        const hasReplace = />>>+\s*REPLACE/i.test(blocks)
        return hasSearch && hasReplace
    },
    { message: 'Invalid SEARCH/REPLACE block format. Required format: <<<<<<< SEARCH\\n...\\n=======\\n...\\n>>>>>>> REPLACE' }
)

export const WriteFileSchema = z.object({
    path: z.string().min(1, 'File path is required'),
    content: z.string()
})

export const CreateFileOrFolderSchema = z.object({
    path: z.string().min(1, 'Path is required'),
    content: z.string().optional()
})

export const DeleteFileOrFolderSchema = z.object({
    path: z.string().min(1, 'Path is required'),
    recursive: z.boolean().optional().default(false)
})

// ===== 终端工具 =====

export const RunCommandSchema = z.object({
    command: z.string().min(1, 'Command is required'),
    cwd: z.string().optional(),
    timeout: z.number().int().positive().max(600).optional().default(30)
})

export const OpenTerminalSchema = z.object({
    name: z.string().min(1, 'Terminal name is required'),
    cwd: z.string().optional()
})

export const RunInTerminalSchema = z.object({
    terminal_id: z.string().min(1, 'Terminal ID is required'),
    command: z.string().min(1, 'Command is required'),
    wait: z.boolean().optional().default(false)
})

export const GetTerminalOutputSchema = z.object({
    terminal_id: z.string().min(1, 'Terminal ID is required'),
    lines: z.number().int().positive().max(1000).optional().default(50)
})

// ===== 搜索工具 =====

export const CodebaseSearchSchema = z.object({
    query: z.string().min(1, 'Search query is required'),
    top_k: z.number().int().positive().max(50).optional().default(10)
})

export const SearchInFileSchema = z.object({
    path: z.string().min(1, 'File path is required'),
    pattern: z.string().min(1, 'Search pattern is required'),
    is_regex: z.boolean().optional().default(false)
})

// ===== LSP 工具 =====

export const LspLocationSchema = z.object({
    path: z.string().min(1, 'File path is required'),
    line: z.number().int().positive('Line number must be positive (1-indexed)'),
    column: z.number().int().positive('Column number must be positive (1-indexed)')
})

export const FindReferencesSchema = LspLocationSchema
export const GoToDefinitionSchema = LspLocationSchema
export const GetHoverInfoSchema = LspLocationSchema

export const GetDocumentSymbolsSchema = z.object({
    path: z.string().min(1, 'File path is required')
})

export const GetLintErrorsSchema = z.object({
    path: z.string().min(1, 'File path is required'),
    refresh: z.boolean().optional().default(false)
})

// ===== 网络工具 =====

export const WebSearchSchema = z.object({
    query: z.string().min(1, 'Search query is required'),
    max_results: z.number().int().positive().max(20).optional().default(5)
})

export const ReadUrlSchema = z.object({
    url: z.string().url('Invalid URL format'),
    timeout: z.number().int().positive().max(120).optional().default(30)
})

export const AskUserSchema = z.object({
    question: z.string().min(1, 'Question is required')
})

// ===== Plan 工具 =====

export const CreatePlanSchema = z.object({
    items: z.array(z.object({
        title: z.string().min(1, 'Title is required'),
        description: z.string().optional()
    })).min(1, 'Plan must have at least one item')
})

export const UpdatePlanSchema = z.object({
    status: z.enum(['active', 'completed', 'failed']).optional(),
    items: z.array(z.object({
        id: z.string(),
        status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'skipped']).optional(),
        title: z.string().optional(),
    })).optional(),
    currentStepId: z.string().nullable().optional()
})

// ===== Schema 映射表 =====

export const toolSchemas: Record<string, z.ZodSchema> = {
    // 文件操作
    read_file: ReadFileSchema,
    list_directory: ListDirectorySchema,
    get_dir_tree: GetDirTreeSchema,
    search_files: SearchFilesSchema,
    read_multiple_files: ReadMultipleFilesSchema,

    // 文件编辑
    edit_file: EditFileSchema,
    write_file: WriteFileSchema,
    create_file_or_folder: CreateFileOrFolderSchema,
    delete_file_or_folder: DeleteFileOrFolderSchema,

    // 终端
    run_command: RunCommandSchema,
    open_terminal: OpenTerminalSchema,
    run_in_terminal: RunInTerminalSchema,
    get_terminal_output: GetTerminalOutputSchema,

    // 搜索
    codebase_search: CodebaseSearchSchema,
    search_in_file: SearchInFileSchema,

    // LSP
    find_references: FindReferencesSchema,
    go_to_definition: GoToDefinitionSchema,
    get_hover_info: GetHoverInfoSchema,
    get_document_symbols: GetDocumentSymbolsSchema,
    get_lint_errors: GetLintErrorsSchema,

    // 网络
    web_search: WebSearchSchema,
    read_url: ReadUrlSchema,

    // 用户交互
    ask_user: AskUserSchema,

    // Plan
    create_plan: CreatePlanSchema,
    update_plan: UpdatePlanSchema
}

// ===== 校验函数 =====

export interface ValidationResult<T = unknown> {
    success: boolean
    data?: T
    error?: string
    hint?: string
}

/**
 * 校验工具参数
 * @param toolName 工具名称
 * @param args 参数对象
 * @returns 校验结果，包含成功标志和数据或错误信息
 */
export function validateToolArgs<T = unknown>(
    toolName: string,
    args: unknown
): ValidationResult<T> {
    const schema = toolSchemas[toolName]

    if (!schema) {
        return {
            success: false,
            error: `Unknown tool: ${toolName}`,
            hint: `Available tools: ${Object.keys(toolSchemas).join(', ')}`
        }
    }

    const result = schema.safeParse(args)

    if (result.success) {
        return {
            success: true,
            data: result.data as T
        }
    }

    // 格式化 Zod 错误信息
    const formattedErrors = result.error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')

    return {
        success: false,
        error: `Invalid parameters: ${formattedErrors}`,
        hint: `Check required fields and parameter types for '${toolName}'`
    }
}

/**
 * 生成工具调用失败的反馈消息（让模型可以自我纠正）
 */
export function formatValidationError(
    toolName: string,
    result: ValidationResult
): string {
    if (result.success) return ''

    return `❌ Tool call '${toolName}' failed validation.

**Error**: ${result.error}

**How to fix**: ${result.hint || 'Check the tool parameters and try again.'}

**Expected format**: Call '${toolName}' with valid parameters as defined in the tool schema.`
}
