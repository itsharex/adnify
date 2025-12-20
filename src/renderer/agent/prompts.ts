/**
 * Agent 提示词系统
 * 参考 Cursor, Windsurf, Void 等优秀 AI 编辑器的设计
 */

import { ChatMode } from '../store'
import { rulesService } from './rulesService'
import { useAgentStore } from './core/AgentStore'
import { FILE_LIMITS } from '../../shared/constants'

// Search/Replace 块格式 - 从统一模块导入
export {
	SEARCH_MARKER as ORIGINAL,
	DIVIDER_MARKER as DIVIDER,
	REPLACE_MARKER as FINAL,
	parseSearchReplaceBlocks,
	applySearchReplaceBlocks,
} from '../utils/searchReplace'

// 限制常量（从共享配置导入）
export const MAX_FILE_CHARS = FILE_LIMITS.MAX_FILE_CHARS
export const MAX_DIR_ITEMS = FILE_LIMITS.MAX_DIR_ITEMS
export const MAX_SEARCH_RESULTS = FILE_LIMITS.MAX_SEARCH_RESULTS
export const MAX_TERMINAL_OUTPUT = FILE_LIMITS.MAX_TERMINAL_OUTPUT
export const MAX_CONTEXT_CHARS = FILE_LIMITS.MAX_CONTEXT_CHARS

// 工具描述
const toolDescriptions = {
	read_file: `Read the contents of a file. Returns the full file content with line numbers.
Parameters:
- path (required): The absolute or relative path to the file
- start_line (optional): Starting line number (1-indexed)
- end_line (optional): Ending line number
- page (optional): Page number for large files`,

	list_directory: `List files and folders in a directory.
Parameters:
- path (required): The directory path
- page (optional): Page number for pagination`,

	get_dir_tree: `Get a recursive tree view of a directory structure. Useful for understanding project layout.
Parameters:
- path (required): The root directory path
- max_depth (optional): Maximum depth to traverse (default: 3, max: 5)`,

	search_files: `Search for text or regex pattern across files in a directory.
Parameters:
- path (required): Directory to search in
- pattern (required): Text or regex pattern to search
- is_regex (optional): Whether pattern is regex (default: false)
- file_pattern (optional): File name filter (e.g., "*.ts")
- page (optional): Page number`,

	search_in_file: `Search for pattern within a specific file. Returns matching line numbers.
Parameters:
- path (required): File path to search in
- pattern (required): Text or regex pattern
- is_regex (optional): Whether pattern is regex`,

	edit_file: `Edit a file using SEARCH/REPLACE blocks. This is the PREFERRED method for making changes.

**CRITICAL**: You MUST read the file first using read_file before editing.

Parameters:
- path (required): Absolute file path to edit
- search_replace_blocks (required): String containing SEARCH/REPLACE blocks

**EXACT FORMAT REQUIRED** (use exactly 7 angle brackets):
\`\`\`
<<<<<<< SEARCH
[exact original code to find - copy from read_file output]
=======
[new replacement code]
>>>>>>> REPLACE
\`\`\`

**FORMAT RULES - MUST FOLLOW:**
1. Use EXACTLY 7 '<' characters followed by ' SEARCH' (with space)
2. Use EXACTLY 7 '=' characters as divider (no text)
3. Use EXACTLY 7 '>' characters followed by ' REPLACE' (with space)
4. Each marker MUST be on its own line
5. Do NOT wrap the blocks in markdown code fences inside the parameter

**CORRECT EXAMPLE:**
\`\`\`
<<<<<<< SEARCH
function oldName() {
  return 1;
}
=======
function newName() {
  return 2;
}
>>>>>>> REPLACE
\`\`\`

**WRONG EXAMPLES (DO NOT DO):**
- \`<<< SEARCH\` (wrong: only 3 brackets)
- \`<<<<<<<SEARCH\` (wrong: no space before SEARCH)
- \`<<<<<<< search\` (wrong: lowercase)

**COMMON ERRORS:**
- "Invalid SEARCH/REPLACE block format" → Check your marker format matches exactly
- "Search block not found" → SEARCH content doesn't match file, re-read the file
- "Matched N times" → SEARCH block is not unique, add more context lines`,

	write_file: `Write or overwrite entire file content. Use edit_file for partial changes.
Parameters:
- path (required): File path
- content (required): Complete file content`,

	create_file_or_folder: `Create a new file or folder. Path ending with / creates a folder.
Parameters:
- path (required): Path to create
- content (optional): Initial content for files`,

	delete_file_or_folder: `Delete a file or folder.
Parameters:
- path (required): Path to delete
- recursive (optional): Delete folder recursively`,

	run_command: `Execute a shell command and wait for completion. For long-running commands, use open_terminal + run_in_terminal.
Parameters:
- command (required): Shell command to execute
- cwd (optional): Working directory
- timeout (optional): Timeout in seconds (default: 30)`,

	open_terminal: `Open a persistent terminal session for long-running commands like dev servers.
Parameters:
- name (required): Terminal name (e.g., "dev-server")
- cwd (optional): Working directory`,

	run_in_terminal: `Run a command in a persistent terminal. Use for dev servers, watchers, etc.
Parameters:
- terminal_id (required): Terminal ID from open_terminal
- command (required): Command to run
- wait (optional): Wait for completion (default: false)`,

	get_terminal_output: `Get recent output from a persistent terminal.
Parameters:
- terminal_id (required): Terminal ID
- lines (optional): Number of recent lines (default: 50)`,

	get_lint_errors: `Get lint/compile errors for a file. Supports TypeScript, JavaScript, Python.
Parameters:
- path (required): File path to check
- refresh (optional): Force refresh cache`,

	create_plan: `Create a new execution plan. Use this at the start of a complex task.
Parameters:
- items (required): Array of plan items, each with 'title' and optional 'description'`,

	update_plan: `Update the current plan status or items. Use this to mark steps as completed or failed.
Parameters:
- status (optional): Update overall plan status ('active', 'completed', 'failed')
- items (optional): Array of items to update, each with 'id' and 'status' ('pending', 'in_progress', 'completed', 'failed', 'skipped')
- currentStepId (optional): Set the current active step ID`,
}

// 构建工具定义字符串
function buildToolDefinitions(mode: ChatMode): string {
	if (mode === 'chat') return ''

	const tools = Object.entries(toolDescriptions)
		.map(([name, desc], i) => `${i + 1}. **${name}**\n${desc}`)
		.join('\n\n')

	return `## Available Tools

${tools}

## Tool Usage Guidelines

1. **Always read before editing**: Read a file to understand its current state before making changes.
2. **Use edit_file for modifications**: Prefer SEARCH/REPLACE blocks over rewriting entire files.
3. **Be precise with SEARCH blocks**: The ORIGINAL text must match exactly, including whitespace.
4. **Handle errors gracefully**: If a tool fails, explain the error and try an alternative approach.
5. **Use persistent terminals for long-running processes**: Dev servers, watchers, etc.
6. **Check lint errors after edits**: Verify your changes don't introduce errors.

**CRITICAL**: When making code changes, you MUST use tools (edit_file, write_file, create_file_or_folder). 
NEVER output code in markdown code blocks for the user to copy-paste. Always apply changes directly via tools.`
}

// 主系统提示词
export async function buildSystemPrompt(
	mode: ChatMode,
	workspacePath: string | null,
	options?: {
		openFiles?: string[]
		activeFile?: string
		customInstructions?: string
		promptTemplateId?: string
	}
): Promise<string> {
	const { openFiles = [], activeFile, customInstructions, promptTemplateId } = options || {}

	// 加载项目规则
	const projectRules = await rulesService.getRules()

	// 获取提示词模板
	const { getPromptTemplateById, getDefaultPromptTemplate } = await import('./promptTemplates')
	const template = promptTemplateId
		? getPromptTemplateById(promptTemplateId) || getDefaultPromptTemplate()
		: getDefaultPromptTemplate()

	// 使用模板的人格提示词（包含身份、沟通风格、代码规范）
	const personalityPrompt = template.systemPrompt

	// 系统信息
	const systemInfo = `## Environment
- OS: ${typeof navigator !== 'undefined' ? ((navigator as any).userAgentData?.platform || navigator.platform || 'Unknown') : 'Unknown'}
- Workspace: ${workspacePath || 'No workspace open'}
- Active File: ${activeFile || 'None'}
- Open Files: ${openFiles.length > 0 ? openFiles.join(', ') : 'None'}
- Date: ${new Date().toLocaleDateString()}`

	// 工具定义（仅 agent 模式）
	const toolDefs = buildToolDefinitions(mode)

	// 获取当前计划
	const store = useAgentStore.getState()
	const plan = store.plan
	const planSection = plan && plan.items.length > 0 ? `
## Current Plan
Status: ${plan.status}

${plan.items.map((item, i) => `${i + 1}. [${item.status === 'completed' ? 'x' : item.status === 'in_progress' ? '/' : item.status === 'failed' ? '!' : ' '}] ${item.title}`).join('\n')}
` : ''

	// Agent 模式特定指导
	const agentGuidelines = mode === 'agent' ? `
## Agent Mode Guidelines

### 📋 Plan Management
If a plan exists (see "Current Plan" above):
1. Check the current status of plan items
2. After completing a step, use \`update_plan\` to mark it as 'completed'
3. If a step fails, mark it as 'failed'
4. If you need to change the plan, use \`update_plan\` to modify items
5. ALWAYS keep the plan status in sync with your actions

### ⛔ Critical Rules

**NEVER:**
- Use bash commands (cat, head, tail, grep) to read files - ALWAYS use read_file tool instead
- Continue working after the task is complete
- Make additional "improvements" or optimizations not requested by the user
- Commit, push, or deploy code unless explicitly asked

**ALWAYS:**
- Bias toward action - just do it, don't ask for confirmation on minor details
- Do exactly what was requested, no more and no less
- Stop immediately when the task is done

### 🔧 Tool Calling Format
You have access to tools via the native function calling API. When you need to use a tool:
1. Decide which tool(s) to use based on the task
2. Call the tool with the required parameters
3. Wait for the result before proceeding
4. Handle any errors by adjusting your approach

**Tool Call Tips:**
- You can call multiple independent tools in parallel
- Always check tool results for errors before continuing
- If a tool fails, read the error message carefully and try a different approach

### 📄 File Editing Workflow
**ALWAYS follow this sequence when editing files:**
1. \`read_file\` - First, read the target file to understand its current content
2. \`edit_file\` - Then, edit using SEARCH/REPLACE blocks
3. \`get_lint_errors\` (optional) - Check for errors after editing

**Key Rules:**
- Never skip step 1 (read_file). The system will reject edits to unread files.
- Keep SEARCH blocks small and unique
- If edit fails, re-read the file and try again with a more specific SEARCH block

### 💬 Response Format
Keep responses SHORT and focused:
- Answer directly, avoid unnecessary explanation
- Don't repeat what the code does
- Skip preambles like "I'll help you..."
- Use brief explanations before/after tool calls

### ⚠️ Error Handling
When a tool returns an error:
- **"Read-before-write required"** → Use read_file first, then retry
- **"Matched N times"** → Your SEARCH block is not unique, make it more specific
- **"Search block not found"** → Content doesn't exist as specified, re-read the file
- **"File not found"** → Check the path, use list_directory to explore

### 🛑 Task Completion
**STOP calling tools when the task is complete.**

When to STOP:
- The requested change has been successfully applied
- The command has been executed successfully
- You have answered the user's question

When you're done:
1. Write a brief summary of what was accomplished
2. Do NOT call any more tools
3. Wait for the user's next request` : ''

	// 自定义指令
	const customSection = customInstructions
		? `\n## Custom Instructions\n\n${customInstructions}`
		: ''

	// 项目规则
	const rulesSection = projectRules?.content
		? `\n## Project Rules (from ${projectRules.source})\n\n${projectRules.content}`
		: ''

	// 组装完整提示词
	const sections = [
		personalityPrompt,
		systemInfo,
		toolDefs,
		planSection,
		agentGuidelines,
		rulesSection,
		customSection,
	].filter(Boolean)

	return sections.join('\n\n').trim()
}

// 用户消息格式化
export function formatUserMessage(
	message: string,
	context?: {
		selections?: Array<{
			type: 'file' | 'code' | 'folder'
			path: string
			content?: string
			range?: [number, number]
		}>
	}
): string {
	let formatted = message

	if (context?.selections && context.selections.length > 0) {
		const selectionsStr = context.selections.map(s => {
			if (s.type === 'code' && s.content && s.range) {
				return `**${s.path}** (lines ${s.range[0]}-${s.range[1]}):\n\`\`\`\n${s.content}\n\`\`\``
			} else if (s.type === 'file' && s.content) {
				return `**${s.path}**:\n\`\`\`\n${s.content}\n\`\`\``
			} else {
				return `**${s.path}**`
			}
		}).join('\n\n')

		formatted += `\n\n---\n**Context:**\n${selectionsStr}`
	}

	return formatted
}

// 工具结果格式化
export function formatToolResult(
	toolName: string,
	result: string,
	success: boolean
): string {
	if (success) {
		return result
	}
	return `Error executing ${toolName}: ${result}`
}
