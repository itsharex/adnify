/**
 * Agent 配置中心
 * 
 * 将所有硬编码值外部化，支持运行时配置
 * 
 * 配置优先级：
 * 1. 用户配置 (config.json 或 UI 设置)
 * 2. 项目配置 (.adnify/agent.json)
 * 3. 默认配置 (本文件)
 */

// ============================================
// 缓存配置
// ============================================

/** 淘汰策略 */
export type EvictionPolicy = 'lru' | 'lfu' | 'fifo'

export interface CacheConfigDef {
    /** 最大条目数 */
    maxSize: number
    /** TTL（毫秒），0 表示永不过期 */
    ttlMs: number
    /** 最大内存（字节） */
    maxMemory?: number
    /** 淘汰策略 */
    evictionPolicy?: EvictionPolicy
    /** 是否启用滑动过期 */
    slidingExpiration?: boolean
    /** 清理间隔（毫秒） */
    cleanupInterval?: number
}

export interface CacheConfigs {
    /** Lint 错误缓存 */
    lint: CacheConfigDef
    /** 代码补全缓存 */
    completion: CacheConfigDef
    /** 目录列表缓存 */
    directory: CacheConfigDef
    /** 文件内容缓存 */
    fileContent: CacheConfigDef
    /** 搜索结果缓存 */
    searchResult: CacheConfigDef
    /** LLM Provider 缓存 */
    llmProvider: CacheConfigDef
    /** LSP 诊断缓存 */
    lspDiagnostics: CacheConfigDef
    /** 健康检查缓存 */
    healthCheck: CacheConfigDef
}

export const DEFAULT_CACHE_CONFIGS: CacheConfigs = {
    lint: {
        maxSize: 100,
        ttlMs: 30000,  // 30秒
        evictionPolicy: 'lru',
    },
    completion: {
        maxSize: 100,
        ttlMs: 60000,  // 1分钟
        evictionPolicy: 'lru',
        slidingExpiration: true,  // 访问时延长
    },
    directory: {
        maxSize: 200,
        ttlMs: 5 * 60 * 1000,  // 5分钟
        evictionPolicy: 'lru',
    },
    fileContent: {
        maxSize: 500,
        ttlMs: 5 * 60 * 1000,  // 5分钟
        maxMemory: 100 * 1024 * 1024,  // 100MB
        evictionPolicy: 'lru',
    },
    searchResult: {
        maxSize: 100,
        ttlMs: 2 * 60 * 1000,  // 2分钟
        maxMemory: 10 * 1024 * 1024,  // 10MB
        evictionPolicy: 'lfu',  // 搜索结果按频率淘汰
    },
    llmProvider: {
        maxSize: 10,
        ttlMs: 30 * 60 * 1000,  // 30分钟
        evictionPolicy: 'lfu',  // 按使用频率
        cleanupInterval: 5 * 60 * 1000,
    },
    lspDiagnostics: {
        maxSize: 500,
        ttlMs: 0,  // 永不过期，由 LSP 更新
        evictionPolicy: 'lru',
        cleanupInterval: 0,  // 禁用自动清理
    },
    healthCheck: {
        maxSize: 20,
        ttlMs: 5 * 60 * 1000,  // 5分钟
        evictionPolicy: 'fifo',
    },
}

// ============================================
// 截断配置
// ============================================

export interface TruncationConfig {
    /** 消息默认最大字符数 */
    messageMaxChars: number
    /** 工具结果最大字符数 */
    toolResultMaxChars: number
}

export const DEFAULT_TRUNCATION_CONFIG: TruncationConfig = {
    messageMaxChars: 2000,
    toolResultMaxChars: 8000,
}

// ============================================
// Agent 运行时配置
// ============================================

export interface AgentRuntimeConfig {
    // 循环控制
    maxToolLoops: number
    maxHistoryMessages: number

    // 上下文限制
    maxToolResultChars: number
    maxFileContentChars: number
    maxTotalContextChars: number
    maxContextTokens: number
    maxSingleFileChars: number
    maxContextFiles: number
    maxSemanticResults: number
    maxTerminalChars: number

    // 重试配置
    maxRetries: number
    retryDelayMs: number
    retryBackoffMultiplier: number

    // 工具执行
    toolTimeoutMs: number
    enableAutoFix: boolean

    // 上下文压缩
    contextCompressThreshold: number
    keepRecentTurns: number

    // 循环检测
    loopDetection: {
        maxHistory: number
        maxExactRepeats: number
        maxSameTargetRepeats: number
    }

    // 目录忽略列表
    ignoredDirectories: string[]

    // 缓存配置
    cache?: Partial<CacheConfigs>

    // 截断配置
    truncation?: Partial<TruncationConfig>
}

export const DEFAULT_AGENT_CONFIG: AgentRuntimeConfig = {
    // 核心执行限制
    maxToolLoops: 20,
    maxHistoryMessages: 60,

    // 上下文大小限制（字符数）
    maxToolResultChars: 15000,
    maxFileContentChars: 20000,
    maxTotalContextChars: 80000,
    maxContextTokens: 128000,
    maxSingleFileChars: 8000,
    maxContextFiles: 8,
    maxSemanticResults: 5,
    maxTerminalChars: 5000,

    // 重试配置
    maxRetries: 3,
    retryDelayMs: 1000,
    retryBackoffMultiplier: 1.5,

    // 工具执行
    toolTimeoutMs: 60000,
    enableAutoFix: true,

    // 上下文压缩
    contextCompressThreshold: 60000,
    keepRecentTurns: 4,

    // 循环检测阈值
    loopDetection: {
        maxHistory: 20,
        maxExactRepeats: 4,
        maxSameTargetRepeats: 5,
    },

    // 目录排除列表
    ignoredDirectories: [
        'node_modules', '.git', 'dist', 'build', '.next',
        '__pycache__', '.venv', 'venv', '.cache', 'coverage',
        '.nyc_output', 'tmp', 'temp', '.idea', '.vscode',
    ],
}

// ============================================
// 配置获取辅助函数
// ============================================

/**
 * 获取缓存配置
 */
export function getCacheConfig(type: keyof CacheConfigs, override?: Partial<CacheConfigDef>): CacheConfigDef {
    const base = DEFAULT_CACHE_CONFIGS[type]
    return override ? { ...base, ...override } : base
}

/**
 * 获取截断配置
 */
export function getTruncationConfig(override?: Partial<TruncationConfig>): TruncationConfig {
    return override ? { ...DEFAULT_TRUNCATION_CONFIG, ...override } : DEFAULT_TRUNCATION_CONFIG
}
