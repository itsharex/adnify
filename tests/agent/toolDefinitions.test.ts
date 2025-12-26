/**
 * 工具定义测试
 * 测试 Zod Schema 验证和工具定义
 */

import { describe, it, expect } from 'vitest'
import {
  validateToolArgs,
  getToolDefinitions,
  getToolApprovalType,
  ReadFileSchema,
  EditFileSchema,
  RunCommandSchema,
  CreatePlanSchema,
} from '../../src/renderer/agent/core/toolDefinitions'

describe('Tool Definitions', () => {
  describe('getToolDefinitions', () => {
    it('should return all tools in agent mode', () => {
      const tools = getToolDefinitions(false)
      expect(tools.length).toBeGreaterThan(0)
      expect(tools.find(t => t.name === 'read_file')).toBeDefined()
      expect(tools.find(t => t.name === 'edit_file')).toBeDefined()
      expect(tools.find(t => t.name === 'run_command')).toBeDefined()
    })

    it('should include plan tools in plan mode', () => {
      const tools = getToolDefinitions(true)
      expect(tools.find(t => t.name === 'create_plan')).toBeDefined()
      expect(tools.find(t => t.name === 'update_plan')).toBeDefined()
    })

    it('should exclude plan tools in non-plan mode', () => {
      const tools = getToolDefinitions(false)
      expect(tools.find(t => t.name === 'create_plan')).toBeUndefined()
      expect(tools.find(t => t.name === 'update_plan')).toBeUndefined()
    })
  })

  describe('getToolApprovalType', () => {
    it('should return terminal for run_command', () => {
      expect(getToolApprovalType('run_command')).toBe('terminal')
    })

    it('should return dangerous for delete_file_or_folder', () => {
      expect(getToolApprovalType('delete_file_or_folder')).toBe('dangerous')
    })

    it('should return undefined for read tools', () => {
      expect(getToolApprovalType('read_file')).toBeUndefined()
      expect(getToolApprovalType('list_directory')).toBeUndefined()
    })
  })
})

describe('Tool Schema Validation', () => {
  describe('ReadFileSchema', () => {
    it('should validate valid path', () => {
      const result = ReadFileSchema.safeParse({ path: 'src/main.ts' })
      expect(result.success).toBe(true)
    })

    it('should validate with line range', () => {
      const result = ReadFileSchema.safeParse({
        path: 'src/main.ts',
        start_line: 1,
        end_line: 10,
      })
      expect(result.success).toBe(true)
    })

    it('should reject empty path', () => {
      const result = ReadFileSchema.safeParse({ path: '' })
      expect(result.success).toBe(false)
    })

    it('should reject invalid line range', () => {
      const result = ReadFileSchema.safeParse({
        path: 'src/main.ts',
        start_line: 10,
        end_line: 5,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('EditFileSchema', () => {
    it('should validate valid SEARCH/REPLACE blocks', () => {
      const result = EditFileSchema.safeParse({
        path: 'src/main.ts',
        search_replace_blocks: '<<<<<<< SEARCH\nold code\n=======\nnew code\n>>>>>>> REPLACE',
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid format', () => {
      const result = EditFileSchema.safeParse({
        path: 'src/main.ts',
        search_replace_blocks: 'just some text',
      })
      expect(result.success).toBe(false)
    })

    it('should preprocess object format to string', () => {
      const result = EditFileSchema.safeParse({
        path: 'src/main.ts',
        search_replace_blocks: [
          { SEARCH: 'old code', REPLACE: 'new code' },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should handle various key name variants', () => {
      const variants = [
        { search: 'old', replace: 'new' },
        { old: 'old', new: 'new' },
        { find: 'old', to: 'new' },
        { original: 'old', replacement: 'new' },
      ]

      for (const variant of variants) {
        const result = EditFileSchema.safeParse({
          path: 'src/main.ts',
          search_replace_blocks: [variant],
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('RunCommandSchema', () => {
    it('should validate valid command', () => {
      const result = RunCommandSchema.safeParse({ command: 'npm install' })
      expect(result.success).toBe(true)
    })

    it('should validate with cwd and timeout', () => {
      const result = RunCommandSchema.safeParse({
        command: 'npm test',
        cwd: './src',
        timeout: 60,
      })
      expect(result.success).toBe(true)
    })

    it('should reject empty command', () => {
      const result = RunCommandSchema.safeParse({ command: '' })
      expect(result.success).toBe(false)
    })

    it('should reject timeout over 600', () => {
      const result = RunCommandSchema.safeParse({
        command: 'npm test',
        timeout: 1000,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('CreatePlanSchema', () => {
    it('should validate valid plan', () => {
      const result = CreatePlanSchema.safeParse({
        items: [
          { title: 'Step 1', description: 'First step' },
          { title: 'Step 2' },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should reject empty items', () => {
      const result = CreatePlanSchema.safeParse({ items: [] })
      expect(result.success).toBe(false)
    })

    it('should reject items without title', () => {
      const result = CreatePlanSchema.safeParse({
        items: [{ description: 'No title' }],
      })
      expect(result.success).toBe(false)
    })
  })
})

describe('validateToolArgs', () => {
  it('should return success for valid args', () => {
    const result = validateToolArgs('read_file', { path: 'src/main.ts' })
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ path: 'src/main.ts' })
  })

  it('should return error for invalid args', () => {
    const result = validateToolArgs('read_file', { path: '' })
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should return error for unknown tool', () => {
    const result = validateToolArgs('unknown_tool', {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unknown tool')
  })

  it('should provide hint for errors', () => {
    const result = validateToolArgs('read_file', {})
    expect(result.success).toBe(false)
    expect(result.hint).toBeDefined()
  })
})
