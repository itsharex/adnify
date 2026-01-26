/**
 * 结构化输出服务
 * 使用 AI SDK 6.0 的 generateObject 和 streamObject API
 */

import { generateObject, streamObject } from 'ai'
import { z } from 'zod'
import { logger } from '@shared/utils/Logger'
import { createModel } from './modelFactory'
import type { LLMConfig } from '@shared/types'

// Schema 定义
const CodeIssueSchema = z.object({
  severity: z.string(),
  message: z.string(),
  line: z.number(),
  column: z.number(),
  endLine: z.number().optional(),
  endColumn: z.number().optional(),
  code: z.string().optional(),
  source: z.string().optional(),
})

const CodeAnalysisSchema = z.object({
  issues: z.array(CodeIssueSchema),
  suggestions: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      priority: z.string(),
      changes: z
        .array(
          z.object({
            line: z.number(),
            oldText: z.string(),
            newText: z.string(),
          })
        )
        .optional(),
    })
  ),
  summary: z.string(),
})

const RefactoringSchema = z.object({
  refactorings: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      confidence: z.string(),
      changes: z.array(
        z.object({
          type: z.string(),
          startLine: z.number(),
          startColumn: z.number(),
          endLine: z.number(),
          endColumn: z.number(),
          newText: z.string().optional(),
        })
      ),
      explanation: z.string(),
    })
  ),
})

const CodeFixSchema = z.object({
  fixes: z.array(
    z.object({
      diagnosticIndex: z.number(),
      title: z.string(),
      description: z.string(),
      changes: z.array(
        z.object({
          startLine: z.number(),
          startColumn: z.number(),
          endLine: z.number(),
          endColumn: z.number(),
          newText: z.string(),
        })
      ),
      confidence: z.string(),
    })
  ),
})

const TestCaseSchema = z.object({
  testCases: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      code: z.string(),
      type: z.string(),
    })
  ),
  setup: z.string().optional(),
  teardown: z.string().optional(),
})

// 类型定义
export type CodeAnalysis = {
  issues: Array<{
    severity: 'error' | 'warning' | 'info' | 'hint'
    message: string
    line: number
    column: number
    endLine?: number
    endColumn?: number
    code?: string
    source?: string
  }>
  suggestions: Array<{
    title: string
    description: string
    priority: 'high' | 'medium' | 'low'
    changes?: Array<{
      line: number
      oldText: string
      newText: string
    }>
  }>
  summary: string
}

export type Refactoring = z.infer<typeof RefactoringSchema>
export type CodeFix = z.infer<typeof CodeFixSchema>
export type TestCase = z.infer<typeof TestCaseSchema>

// 辅助函数
function normalizeCodeAnalysis(raw: z.infer<typeof CodeAnalysisSchema>): CodeAnalysis {
  return {
    issues: raw.issues.map((issue) => ({
      ...issue,
      severity: issue.severity.toLowerCase() as 'error' | 'warning' | 'info' | 'hint',
    })),
    suggestions: raw.suggestions.map((suggestion) => ({
      ...suggestion,
      priority: suggestion.priority.toLowerCase() as 'high' | 'medium' | 'low',
    })),
    summary: raw.summary,
  }
}

export class StructuredService {
  async analyzeCode(params: {
    config: LLMConfig
    code: string
    language: string
    filePath: string
  }): Promise<CodeAnalysis> {
    logger.system.info('[StructuredService] Analyzing code')

    const model = createModel(params.config)

    const result = await generateObject({
      model,
      schema: CodeAnalysisSchema,
      schemaName: 'CodeAnalysis',
      schemaDescription: 'Code analysis result with issues, suggestions, and summary',
      prompt: `Analyze the following ${params.language} code and return a structured analysis.

File: ${params.filePath}

\`\`\`${params.language}
${params.code}
\`\`\`

You must return a JSON object with exactly these fields:
- issues: array of code issues (each with severity, message, line, column)
- suggestions: array of improvement suggestions (each with title, description, priority)
- summary: a brief text summary of the analysis

Example response format:
{
  "issues": [
    {"severity": "warning", "message": "Unused variable", "line": 5, "column": 10}
  ],
  "suggestions": [
    {"title": "Add error handling", "description": "Consider adding try-catch", "priority": "high"}
  ],
  "summary": "The code is well-structured but could benefit from error handling."
}`,
    })

    return normalizeCodeAnalysis(result.object)
  }

  async suggestRefactoring(params: {
    config: LLMConfig
    code: string
    language: string
    intent: string
  }): Promise<Refactoring> {
    logger.system.info('[StructuredService] Suggesting refactoring')

    const model = createModel(params.config)

    const result = await generateObject({
      model,
      schema: RefactoringSchema,
      schemaName: 'Refactoring',
      schemaDescription: 'Code refactoring suggestions',
      prompt: `Suggest refactorings for the following ${params.language} code.

Intent: ${params.intent}

\`\`\`${params.language}
${params.code}
\`\`\`

Return a JSON object with:
- refactorings: array of refactoring suggestions (each with title, description, confidence, changes, explanation)`,
    })

    return result.object
  }

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
    logger.system.info('[StructuredService] Suggesting fixes')

    const model = createModel(params.config)

    const diagnosticsText = params.diagnostics.map((d, i) => `${i}. Line ${d.line}: ${d.message}`).join('\n')

    const result = await generateObject({
      model,
      schema: CodeFixSchema,
      schemaName: 'CodeFix',
      schemaDescription: 'Code fix suggestions for diagnostics',
      prompt: `Suggest fixes for the following ${params.language} errors:

Diagnostics:
${diagnosticsText}

Code:
\`\`\`${params.language}
${params.code}
\`\`\`

Return a JSON object with:
- fixes: array of fix suggestions (each with diagnosticIndex, title, description, changes, confidence)`,
    })

    return result.object
  }

  async generateTests(params: {
    config: LLMConfig
    code: string
    language: string
    framework?: string
  }): Promise<TestCase> {
    logger.system.info('[StructuredService] Generating tests')

    const model = createModel(params.config)

    const result = await generateObject({
      model,
      schema: TestCaseSchema,
      schemaName: 'TestCase',
      schemaDescription: 'Generated test cases',
      prompt: `Generate test cases for the following ${params.language} code${params.framework ? ` using ${params.framework}` : ''}.

\`\`\`${params.language}
${params.code}
\`\`\`

Return a JSON object with:
- testCases: array of test cases (each with name, description, code, type)
- setup: optional setup code
- teardown: optional teardown code`,
    })

    return result.object
  }

  async analyzeCodeStream(
    params: {
      config: LLMConfig
      code: string
      language: string
      filePath: string
    },
    onPartial: (partial: unknown) => void
  ): Promise<CodeAnalysis> {
    logger.system.info('[StructuredService] Analyzing code (streaming)')

    const model = createModel(params.config)

    const result = streamObject({
      model,
      schema: CodeAnalysisSchema,
      schemaName: 'CodeAnalysis',
      schemaDescription: 'Code analysis result with issues, suggestions, and summary',
      prompt: `Analyze the following ${params.language} code and return a structured analysis.

File: ${params.filePath}

\`\`\`${params.language}
${params.code}
\`\`\`

Return a JSON object with:
- issues: array of code issues
- suggestions: array of improvement suggestions
- summary: brief text summary`,
    })

    for await (const partial of result.partialObjectStream) {
      onPartial(partial)
    }

    return normalizeCodeAnalysis(await result.object)
  }
}
