/**
 * 上下文管理服务
 * 智能选择和管理 AI 对话的上下文
 */

import { useStore } from '../store'

export interface FileContext {
	path: string
	content: string
	type: 'active' | 'open' | 'referenced' | 'related' | 'semantic'
	relevance: number // 0-1
	startLine?: number
	endLine?: number
}

export interface ContextSelection {
	type: 'file' | 'code' | 'folder'
	path: string
	content?: string
	range?: [number, number] // [startLine, endLine]
}

// 上下文限制
const MAX_CONTEXT_CHARS = 50000
const MAX_FILES = 10

/**
 * 解析消息中的 @file 引用
 * 支持格式: @file:path/to/file.ts 或 @path/to/file.ts
 */
export function parseFileReferences(message: string): string[] {
	const refs: string[] = []
	
	// 匹配 @file:path 或 @path 格式（排除 @codebase）
	const regex = /@(?:file:)?([^\s@]+\.[a-zA-Z0-9]+)/g
	let match
	
	while ((match = regex.exec(message)) !== null) {
		if (match[1] !== 'codebase') {
			refs.push(match[1])
		}
	}
	
	return [...new Set(refs)] // 去重
}

/**
 * 检查消息是否包含 @codebase 引用
 */
export function hasCodebaseReference(message: string): boolean {
	return /@codebase\b/i.test(message)
}

/**
 * 移除消息中的 @file 和 @codebase 引用，返回清理后的消息
 */
export function cleanFileReferences(message: string): string {
	return message
		.replace(/@codebase\b/gi, '')
		.replace(/@(?:file:)?[^\s@]+\.[a-zA-Z0-9]+/g, '')
		.trim()
}

/**
 * 获取文件扩展名对应的语言
 */
function getLanguageFromPath(path: string): string {
	const ext = path.split('.').pop()?.toLowerCase() || ''
	const langMap: Record<string, string> = {
		ts: 'typescript',
		tsx: 'typescript',
		js: 'javascript',
		jsx: 'javascript',
		py: 'python',
		rs: 'rust',
		go: 'go',
		java: 'java',
		cpp: 'cpp',
		c: 'c',
		h: 'c',
		hpp: 'cpp',
		css: 'css',
		scss: 'scss',
		less: 'less',
		html: 'html',
		json: 'json',
		yaml: 'yaml',
		yml: 'yaml',
		md: 'markdown',
		sql: 'sql',
		sh: 'bash',
		bash: 'bash',
		zsh: 'bash',
	}
	return langMap[ext] || ext
}

/**
 * 格式化文件内容为上下文字符串
 */
export function formatFileContext(file: FileContext): string {
	const lang = getLanguageFromPath(file.path)
	const lines = file.content.split('\n')
	const lineCount = lines.length
	
	// 如果文件太大，截断并添加提示
	let content = file.content
	if (content.length > 10000) {
		content = content.slice(0, 10000) + '\n\n... (truncated, file has ' + lineCount + ' lines)'
	}
	
	return `**${file.path}** (${lineCount} lines):\n\`\`\`${lang}\n${content}\n\`\`\``
}

export async function formatProjectStructure(rootPath: string): Promise<string> {
    const tree = await window.electronAPI.getFileTree(rootPath, 3) // 限制深度为3
    return `**Project Structure:**\n\`\`\`\n${tree}\n\`\`\``
}

/**
 * 格式化语义搜索结果
 */
export function formatSemanticResult(result: FileContext): string {
	const lang = getLanguageFromPath(result.path)
	const lineInfo = result.startLine && result.endLine 
		? ` (lines ${result.startLine}-${result.endLine})` 
		: ''
	const scoreInfo = result.relevance < 1 ? ` [relevance: ${(result.relevance * 100).toFixed(0)}%]` : ''
	
	return `**${result.path}**${lineInfo}${scoreInfo}:\n\`\`\`${lang}\n${result.content}\n\`\`\``
}

/**
 * 构建上下文字符串
 */
export function buildContextString(files: FileContext[], projectStructure?: string, semanticResults?: FileContext[]): string {
    let context = '---\n**Context:**\n\n'
    
    if (projectStructure) {
        context += projectStructure + '\n\n'
    }
    
	// 语义搜索结果
	if (semanticResults && semanticResults.length > 0) {
		context += '**Relevant Code (from codebase search):**\n\n'
		context += semanticResults.map(formatSemanticResult).join('\n\n')
		context += '\n\n'
	}
	
	// 文件引用
	if (files.length > 0) {
		context += '**Referenced Files:**\n\n'
        const sections = files.map(formatFileContext)
	    context += sections.join('\n\n')
    }
    
    return context
}

/**
 * 执行代码库语义搜索
 */
export async function searchCodebase(query: string, topK: number = 8): Promise<FileContext[]> {
	const state = useStore.getState()
	if (!state.workspacePath) return []
	
	try {
		const results = await window.electronAPI.indexSearch(state.workspacePath, query, topK)
		return results.map(r => ({
			path: r.relativePath,
			content: r.content,
			type: 'semantic' as const,
			relevance: r.score,
			startLine: r.startLine,
			endLine: r.endLine,
		}))
	} catch (e) {
		console.error('[Context] Codebase search failed:', e)
		return []
	}
}

/**
 * 智能收集上下文
 */
export async function collectContext(
	message: string,
	options?: {
		includeActiveFile?: boolean
		includeOpenFiles?: boolean
        includeProjectStructure?: boolean
		maxChars?: number
	}
): Promise<{
	files: FileContext[]
	semanticResults: FileContext[]
    projectStructure?: string
	cleanedMessage: string
	totalChars: number
}> {
	const {
		includeActiveFile = true,
		includeOpenFiles = false,
        includeProjectStructure = true,
		maxChars = MAX_CONTEXT_CHARS,
	} = options || {}
	
	const state = useStore.getState()
	const files: FileContext[] = []
	let semanticResults: FileContext[] = []
	let totalChars = 0
    let projectStructure = ''

    // 0. 获取项目结构
    if (includeProjectStructure && state.workspacePath) {
        projectStructure = await formatProjectStructure(state.workspacePath)
        totalChars += projectStructure.length
    }
	
	// 1. 解析 @file 引用
	const refs = parseFileReferences(message)
	const useCodebase = hasCodebaseReference(message)
	const cleanedMessage = cleanFileReferences(message)
	
	// 2. 如果使用 @codebase，执行语义搜索
	if (useCodebase && cleanedMessage.trim()) {
		semanticResults = await searchCodebase(cleanedMessage, 8)
		// 计算语义结果的字符数
		for (const result of semanticResults) {
			totalChars += result.content.length + 100 // 额外的格式化开销
		}
	}
	
	// 3. 加载引用的文件
	for (const ref of refs) {
		if (files.length >= MAX_FILES) break
		
		// 尝试在工作区中查找文件
		let fullPath = ref
		if (state.workspacePath && !ref.startsWith('/') && !ref.includes(':')) {
			fullPath = `${state.workspacePath}/${ref}`
		}
		
		const content = await window.electronAPI.readFile(fullPath)
		if (content && totalChars + content.length <= maxChars) {
			files.push({
				path: ref,
				content,
				type: 'referenced',
				relevance: 1.0,
			})
			totalChars += content.length
		}
	}
	
	// 4. 添加当前活动文件
	if (includeActiveFile && state.activeFilePath) {
		const activeFile = state.openFiles.find(f => f.path === state.activeFilePath)
		if (activeFile && !files.some(f => f.path === activeFile.path)) {
			if (totalChars + activeFile.content.length <= maxChars) {
				files.push({
					path: activeFile.path,
					content: activeFile.content,
					type: 'active',
					relevance: 0.9,
				})
				totalChars += activeFile.content.length
			}
		}
	}
	
	// 5. 添加其他打开的文件（可选）
	if (includeOpenFiles) {
		for (const openFile of state.openFiles) {
			if (files.length >= MAX_FILES) break
			if (files.some(f => f.path === openFile.path)) continue
			if (totalChars + openFile.content.length > maxChars) continue
			
			files.push({
				path: openFile.path,
				content: openFile.content,
				type: 'open',
				relevance: 0.5,
			})
			totalChars += openFile.content.length
		}
	}
	
	// 按相关性排序
	files.sort((a, b) => b.relevance - a.relevance)
	
	return { files, semanticResults, projectStructure, cleanedMessage, totalChars }
}

/**
 * 上下文服务单例
 */
export const contextService = {
	parseFileReferences,
	cleanFileReferences,
	hasCodebaseReference,
	formatFileContext,
	formatSemanticResult,
    formatProjectStructure,
	buildContextString,
	searchCodebase,
	collectContext,
}
