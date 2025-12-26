/**
 * 健壮的流式 JSON 解析器
 * 用于解析 LLM 流式输出的不完整 JSON，支持自动补全缺失的结构
 */

/**
 * 尝试解析部分 JSON 字符串
 * 使用状态机方法，比简单的正则替换更健壮
 */
export function parsePartialJson(jsonString: string): Record<string, unknown> | null {
  if (!jsonString || jsonString.trim().length === 0) {
    return null
  }

  // 1. 尝试直接解析（最快）
  try {
    return JSON.parse(jsonString)
  } catch {
    // 继续尝试修复
  }

  // 2. 尝试修复并解析
  try {
    const fixed = fixJson(jsonString)
    return JSON.parse(fixed)
  } catch (e) {
    // 3. 如果修复失败，尝试提取已知字段作为最后手段
    return extractKnownFields(jsonString)
  }
}

/**
 * 修复不完整的 JSON 字符串
 * 通过模拟 JSON 解析状态机来补全缺失的结尾
 */
function fixJson(input: string): string {
  let processed = input.trim()

  // 确保以 { 或 [ 开头
  if (!processed.startsWith('{') && !processed.startsWith('[')) {
    const firstBrace = processed.indexOf('{')
    const firstBracket = processed.indexOf('[')

    if (firstBrace === -1 && firstBracket === -1) return '{}'

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      processed = processed.slice(firstBrace)
    } else {
      processed = processed.slice(firstBracket)
    }
  }

  const stack: ('{' | '[' | '"')[] = []
  let isEscaped = false
  let inString = false

  // 扫描字符串，维护状态栈
  for (let i = 0; i < processed.length; i++) {
    const char = processed[i]

    if (isEscaped) {
      isEscaped = false
      continue
    }

    if (char === '\\') {
      isEscaped = true
      continue
    }

    if (char === '"') {
      if (inString) {
        // 字符串结束
        inString = false
        // 弹出栈顶的引号标记（如果有的话，虽然我们只用 boolean 标记 inString，但为了逻辑一致性）
      } else {
        // 字符串开始
        inString = true
      }
      continue
    }

    if (!inString) {
      if (char === '{') {
        stack.push('{')
      } else if (char === '[') {
        stack.push('[')
      } else if (char === '}') {
        if (stack.length > 0 && stack[stack.length - 1] === '{') {
          stack.pop()
        }
      } else if (char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === '[') {
          stack.pop()
        }
      }
    }
  }

  // 根据状态栈补全结尾
  let result = processed

  // 1. 如果在字符串中结束，补全引号
  if (inString) {
    // 检查是否以转义符结尾
    if (result.endsWith('\\')) {
      result += '\\' // 补全转义符，变成 \\"
    }
    result += '"'
  }

  // 2. 补全缺失的括号
  while (stack.length > 0) {
    const token = stack.pop()
    if (token === '{') {
      result += '}'
    } else if (token === '[') {
      result += ']'
    }
  }

  return result
}

/**
 * 从严重损坏的 JSON 中提取已知字段
 * 正则表达式回退策略
 */
function extractKnownFields(jsonString: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  // 辅助函数：安全提取字段
  const extract = (key: string) => {
    // 匹配 "key": "value..." 或 "key": value
    // 注意：这只是一个简单的启发式匹配，无法处理复杂的嵌套
    const regex = new RegExp(`"${key}"\\s*:\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|([^,}]+))`)
    const match = jsonString.match(regex)
    if (match) {
      if (match[1] !== undefined) {
        // 字符串值
        try {
          result[key] = JSON.parse(`"${match[1]}"`)
        } catch {
          result[key] = match[1] // 回退到原始字符串
        }
      } else if (match[2] !== undefined) {
        // 非字符串值 (number, boolean, null)
        try {
          result[key] = JSON.parse(match[2])
        } catch {
          result[key] = match[2]
        }
      }
    }
  }

  // 常用工具参数字段
  const commonFields = [
    'path', 'content', 'command', 'query', 'pattern',
    'search_replace_blocks', 'start_line', 'end_line',
    'line', 'column', 'paths', 'url', 'question'
  ]

  commonFields.forEach(extract)

  return result
}

/**
 * 工具结果截断配置
 */
interface TruncateConfig {
  maxLength: number
  headRatio: number  // 保留开头的比例
  tailRatio: number  // 保留结尾的比例
}

/**
 * 工具特定的截断配置
 */
const TOOL_TRUNCATE_CONFIG: Record<string, TruncateConfig> = {
  // 文件读取：保留更多内容，开头更重要
  read_file: { maxLength: 20000, headRatio: 0.8, tailRatio: 0.15 },
  read_multiple_files: { maxLength: 30000, headRatio: 0.8, tailRatio: 0.15 },

  // 搜索结果：开头最相关
  search_files: { maxLength: 10000, headRatio: 0.9, tailRatio: 0.05 },
  codebase_search: { maxLength: 10000, headRatio: 0.9, tailRatio: 0.05 },
  find_references: { maxLength: 8000, headRatio: 0.85, tailRatio: 0.1 },
  grep_search: { maxLength: 10000, headRatio: 0.9, tailRatio: 0.05 },

  // 目录结构：开头更重要
  get_dir_tree: { maxLength: 8000, headRatio: 0.85, tailRatio: 0.1 },
  list_directory: { maxLength: 8000, headRatio: 0.85, tailRatio: 0.1 },

  // 命令输出：结尾更重要（错误信息通常在最后）
  run_command: { maxLength: 15000, headRatio: 0.2, tailRatio: 0.75 },
  execute_command: { maxLength: 15000, headRatio: 0.2, tailRatio: 0.75 },

  // 符号/定义：均衡
  get_document_symbols: { maxLength: 8000, headRatio: 0.6, tailRatio: 0.35 },
  get_definition: { maxLength: 5000, headRatio: 0.7, tailRatio: 0.25 },
  get_hover_info: { maxLength: 3000, headRatio: 0.7, tailRatio: 0.25 },

  // Lint 错误：开头更重要
  get_lint_errors: { maxLength: 8000, headRatio: 0.85, tailRatio: 0.1 },

  // 默认配置
  default: { maxLength: 12000, headRatio: 0.7, tailRatio: 0.25 },
}

/**
 * 智能截断工具结果
 * 根据工具类型和内容特点进行截断，避免 UI 卡顿
 */
export function truncateToolResult(
  result: string,
  toolName: string,
  maxLength?: number
): string {
  if (!result) return ''

  const config = TOOL_TRUNCATE_CONFIG[toolName] || TOOL_TRUNCATE_CONFIG.default
  const limit = maxLength || config.maxLength

  if (result.length <= limit) {
    return result
  }

  // 计算截断位置
  const headSize = Math.floor(limit * config.headRatio)
  const tailSize = Math.floor(limit * config.tailRatio)
  const omitted = result.length - headSize - tailSize

  // 尝试在行边界截断（更友好的输出）
  const head = truncateAtLineEnd(result.slice(0, headSize + 200), headSize)
  const tail = truncateAtLineStart(result.slice(-tailSize - 200), tailSize)

  const truncatedMsg = `\n\n... [truncated: ${omitted.toLocaleString()} chars omitted] ...\n\n`

  return head + truncatedMsg + tail
}

/**
 * 在行尾截断（向前找换行符）
 */
function truncateAtLineEnd(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text

  // 在 maxLen 附近找换行符
  const searchStart = Math.max(0, maxLen - 100)
  const lastNewline = text.lastIndexOf('\n', maxLen)

  if (lastNewline > searchStart) {
    return text.slice(0, lastNewline)
  }

  return text.slice(0, maxLen)
}

/**
 * 在行首截断（向后找换行符）
 */
function truncateAtLineStart(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text

  const startPos = text.length - maxLen
  const searchEnd = Math.min(text.length, startPos + 100)
  const firstNewline = text.indexOf('\n', startPos)

  if (firstNewline !== -1 && firstNewline < searchEnd) {
    return text.slice(firstNewline + 1)
  }

  return text.slice(-maxLen)
}
