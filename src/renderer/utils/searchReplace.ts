/**
 * Search/Replace 工具模块
 * 统一处理 SEARCH/REPLACE 块的解析和应用
 * 
 * 这是唯一的 Search/Replace 实现，所有其他模块应该从这里导入
 */

// Search/Replace 块格式 (Git 风格，LLM 更熟悉)
export const SEARCH_MARKER = '<<<<<<< SEARCH'
export const DIVIDER_MARKER = '======='
export const REPLACE_MARKER = '>>>>>>> REPLACE'

// 兼容旧格式的别名
export const ORIGINAL = SEARCH_MARKER
export const DIVIDER = DIVIDER_MARKER
export const FINAL = REPLACE_MARKER

// ===== 类型定义 =====

export interface SearchReplaceBlock {
    search: string
    replace: string
}

export interface ApplyResult {
    newContent: string
    appliedCount: number
    errors: string[]
}

// ===== 核心函数 =====

/**
 * 解析 Search/Replace 块字符串
 * 支持多种 LLM 生成的格式变体
 */
export function parseSearchReplaceBlocks(blocksStr: string): SearchReplaceBlock[] {
    const blocks: SearchReplaceBlock[] = []
    // 先统一换行符
    const normalized = blocksStr.replace(/\r\n/g, '\n')

    // 更宽容的正则：支持可变数量的 < 和 >，以及可选空格
    const regex = /<{3,}\s*SEARCH\s*\n([\s\S]*?)\n={3,}\s*\n([\s\S]*?)\n>{3,}\s*REPLACE/gi
    let match

    while ((match = regex.exec(normalized)) !== null) {
        blocks.push({
            search: match[1],
            replace: match[2],
        })
    }

    return blocks
}

/**
 * 统计 SEARCH 块在内容中的匹配次数
 */
function countMatches(content: string, search: string, fuzzy = false): { count: number; positions: number[] } {
    const positions: number[] = []
    const contentLines = content.split('\n')
    const searchLines = search.split('\n')

    if (fuzzy) {
        // 模糊匹配（忽略行尾空白）
        const searchLinesTrimmed = searchLines.map(l => l.trimEnd())
        for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
            const slice = contentLines.slice(i, i + searchLines.length)
            const sliceTrimmed = slice.map(l => l.trimEnd())
            if (sliceTrimmed.join('\n') === searchLinesTrimmed.join('\n')) {
                positions.push(i + 1) // 1-indexed line number
            }
        }
    } else {
        // 精确匹配
        let index = 0
        while (index < content.length) {
            const found = content.indexOf(search, index)
            if (found === -1) break
            // 计算行号
            const beforeMatch = content.slice(0, found)
            const matchLineNum = beforeMatch.split('\n').length
            positions.push(matchLineNum)
            index = found + 1
        }
    }

    return { count: positions.length, positions }
}

/**
 * 应用 Search/Replace 块到内容
 * 
 * 支持：
 * 1. 精确匹配
 * 2. 模糊匹配（忽略行尾空白）
 * 3. 缩进不敏感匹配（忽略每行前导空格）
 * 
 * 安全机制：
 * - 唯一性验证：每个 SEARCH 块必须唯一匹配
 * - 多匹配报错：如果有多个匹配位置，返回详细错误
 */
export function applySearchReplaceBlocks(
    content: string,
    blocks: SearchReplaceBlock[]
): ApplyResult {
    // 统一换行符为 \n
    const normalizedContent = content.replace(/\r\n/g, '\n')
    let currentContent = normalizedContent
    let appliedCount = 0
    const errors: string[] = []

    for (const block of blocks) {
        const normalizedSearch = block.search.replace(/\r\n/g, '\n')
        const normalizedReplace = block.replace.replace(/\r\n/g, '\n')

        // 1. 先检查唯一性（精确匹配）
        const exactMatches = countMatches(currentContent, normalizedSearch, false)

        if (exactMatches.count > 1) {
            const preview = normalizedSearch.trim().slice(0, 80)
            errors.push(`⚠️ SEARCH block matched ${exactMatches.count} times at lines [${exactMatches.positions.join(', ')}]. ` +
                `Please use a more specific/unique block.\n"${preview}${normalizedSearch.length > 80 ? '...' : ''}"`)
            continue
        }

        if (exactMatches.count === 1) {
            currentContent = currentContent.replace(normalizedSearch, normalizedReplace)
            appliedCount++
            continue
        }

        // 2. 尝试模糊匹配（忽略行尾空白）
        const searchLines = normalizedSearch.split('\n')
        const searchLinesTrimmed = searchLines.map(l => l.trimEnd())
        const contentLines = currentContent.split('\n')
        let found = false
        let matchPositions: number[] = []

        // 先收集所有匹配位置
        for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
            const slice = contentLines.slice(i, i + searchLines.length)
            const sliceTrimmed = slice.map(l => l.trimEnd())
            if (sliceTrimmed.join('\n') === searchLinesTrimmed.join('\n')) {
                matchPositions.push(i + 1)
            }
        }

        if (matchPositions.length > 1) {
            const preview = normalizedSearch.trim().slice(0, 80)
            errors.push(`⚠️ SEARCH block matched ${matchPositions.length} times at lines [${matchPositions.join(', ')}]. ` +
                `Please use a more specific/unique block.\n"${preview}${normalizedSearch.length > 80 ? '...' : ''}"`)
            continue
        }

        if (matchPositions.length === 1) {
            const i = matchPositions[0] - 1
            contentLines.splice(i, searchLines.length, ...normalizedReplace.split('\n'))
            currentContent = contentLines.join('\n')
            appliedCount++
            found = true
        }

        if (found) continue

        // 3. 尝试缩进不敏感匹配（忽略前导空格）
        const searchLinesNoIndent = searchLines.map(l => l.trim())
        matchPositions = []

        for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
            const slice = contentLines.slice(i, i + searchLines.length)
            const sliceNoIndent = slice.map(l => l.trim())
            if (sliceNoIndent.join('\n') === searchLinesNoIndent.join('\n')) {
                matchPositions.push(i + 1)
            }
        }

        if (matchPositions.length > 1) {
            const preview = normalizedSearch.trim().slice(0, 80)
            errors.push(`⚠️ SEARCH block matched ${matchPositions.length} times at lines [${matchPositions.join(', ')}] (indent-insensitive). ` +
                `Please use a more specific/unique block.\n"${preview}${normalizedSearch.length > 80 ? '...' : ''}"`)
            continue
        }

        if (matchPositions.length === 1) {
            const i = matchPositions[0] - 1
            contentLines.splice(i, searchLines.length, ...normalizedReplace.split('\n'))
            currentContent = contentLines.join('\n')
            appliedCount++
            found = true
        }

        if (!found) {
            const preview = normalizedSearch.trim().slice(0, 100)
            errors.push(`❌ Search block not found (tried exact, fuzzy, and indent-insensitive matching):\n"${preview}${normalizedSearch.length > 100 ? '...' : ''}"`)
        }
    }

    return { newContent: currentContent, appliedCount, errors }
}

/**
 * 计算两个文本之间的行数变化
 * 使用简单的 LCS 算法计算实际增加和删除的行数
 */
export function calculateLineChanges(
    oldContent: string,
    newContent: string
): { added: number; removed: number } {
    const oldLines = oldContent.split('\n')
    const newLines = newContent.split('\n')

    // 构建简单的 LCS 长度矩阵
    const m = oldLines.length
    const n = newLines.length
    const dp: number[][] = Array(m + 1)
        .fill(null)
        .map(() => Array(n + 1).fill(0))

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (oldLines[i - 1] === newLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
            }
        }
    }

    const commonLines = dp[m][n]
    const removed = m - commonLines
    const added = n - commonLines

    return { added, removed }
}
