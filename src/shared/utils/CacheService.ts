/**
 * 通用缓存服务
 * 支持 TTL、LRU 淘汰、大小限制
 */

import { logger } from './Logger'

// 缓存条目
interface CacheEntry<T> {
  value: T
  createdAt: number
  lastAccessed: number
  accessCount: number
  size: number
  ttl?: number
}

// 缓存配置
export interface CacheConfig {
  maxSize: number           // 最大条目数
  maxMemory: number         // 最大内存（字节）
  defaultTTL: number        // 默认 TTL（毫秒），0 表示永不过期
  cleanupInterval: number   // 清理间隔（毫秒）
  onEvict?: (key: string, value: unknown) => void
}

// 缓存统计
export interface CacheStats {
  hits: number
  misses: number
  evictions: number
  size: number
  memoryUsage: number
  hitRate: number
}

export class CacheService<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map()
  private config: CacheConfig
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
    memoryUsage: 0,
    hitRate: 0,
  }
  private cleanupTimer: NodeJS.Timeout | null = null
  private name: string

  constructor(name: string, config?: Partial<CacheConfig>) {
    this.name = name
    this.config = {
      maxSize: 1000,
      maxMemory: 50 * 1024 * 1024, // 50MB
      defaultTTL: 5 * 60 * 1000,   // 5 分钟
      cleanupInterval: 60 * 1000,  // 1 分钟
      ...config,
    }

    this.startCleanup()
  }

  /**
   * 获取缓存值
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key)

    if (!entry) {
      this.stats.misses++
      this.updateHitRate()
      return undefined
    }

    // 检查是否过期
    if (this.isExpired(entry)) {
      this.delete(key)
      this.stats.misses++
      this.updateHitRate()
      return undefined
    }

    // 更新访问信息
    entry.lastAccessed = Date.now()
    entry.accessCount++
    this.stats.hits++
    this.updateHitRate()

    return entry.value
  }

  /**
   * 设置缓存值
   */
  set(key: string, value: T, ttl?: number): void {
    const size = this.estimateSize(value)

    // 检查是否需要淘汰
    this.ensureCapacity(size)

    const entry: CacheEntry<T> = {
      value,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
      size,
      ttl: ttl ?? this.config.defaultTTL,
    }

    // 如果已存在，先减去旧的大小
    const existing = this.cache.get(key)
    if (existing) {
      this.stats.memoryUsage -= existing.size
    }

    this.cache.set(key, entry)
    this.stats.size = this.cache.size
    this.stats.memoryUsage += size

    logger.cache.debug(`[${this.name}] Set: ${key}`, { size, ttl: entry.ttl })
  }

  /**
   * 检查是否存在
   */
  has(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false
    if (this.isExpired(entry)) {
      this.delete(key)
      return false
    }
    return true
  }

  /**
   * 删除缓存
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false

    this.cache.delete(key)
    this.stats.size = this.cache.size
    this.stats.memoryUsage -= entry.size

    logger.cache.debug(`[${this.name}] Delete: ${key}`)
    return true
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear()
    this.stats.size = 0
    this.stats.memoryUsage = 0
    logger.cache.info(`[${this.name}] Cleared`)
  }

  /**
   * 获取或设置（如果不存在则调用 factory 创建）
   */
  async getOrSet(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get(key)
    if (cached !== undefined) {
      return cached
    }

    const value = await factory()
    this.set(key, value, ttl)
    return value
  }

  /**
   * 同步版本的 getOrSet
   */
  getOrSetSync(key: string, factory: () => T, ttl?: number): T {
    const cached = this.get(key)
    if (cached !== undefined) {
      return cached
    }

    const value = factory()
    this.set(key, value, ttl)
    return value
  }

  /**
   * 批量获取
   */
  getMany(keys: string[]): Map<string, T> {
    const result = new Map<string, T>()
    for (const key of keys) {
      const value = this.get(key)
      if (value !== undefined) {
        result.set(key, value)
      }
    }
    return result
  }

  /**
   * 批量设置
   */
  setMany(entries: Array<{ key: string; value: T; ttl?: number }>): void {
    for (const { key, value, ttl } of entries) {
      this.set(key, value, ttl)
    }
  }

  /**
   * 获取所有键
   */
  keys(): string[] {
    return Array.from(this.cache.keys())
  }

  /**
   * 获取统计信息
   */
  getStats(): CacheStats {
    return { ...this.stats }
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats.hits = 0
    this.stats.misses = 0
    this.stats.evictions = 0
    this.updateHitRate()
  }

  /**
   * 销毁缓存
   */
  destroy(): void {
    this.stopCleanup()
    this.clear()
  }

  // ===== 私有方法 =====

  private isExpired(entry: CacheEntry<T>): boolean {
    if (!entry.ttl || entry.ttl === 0) return false
    return Date.now() - entry.createdAt > entry.ttl
  }

  private estimateSize(value: T): number {
    try {
      const str = JSON.stringify(value)
      return str.length * 2 // UTF-16 编码
    } catch {
      return 1024 // 默认 1KB
    }
  }

  private ensureCapacity(newSize: number): void {
    // 检查条目数量
    while (this.cache.size >= this.config.maxSize) {
      this.evictOne()
    }

    // 检查内存使用
    while (this.stats.memoryUsage + newSize > this.config.maxMemory && this.cache.size > 0) {
      this.evictOne()
    }
  }

  private evictOne(): void {
    // LRU 淘汰：找到最久未访问的条目
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed
        oldestKey = key
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey)
      if (entry) {
        this.config.onEvict?.(oldestKey, entry.value)
        this.cache.delete(oldestKey)
        this.stats.size = this.cache.size
        this.stats.memoryUsage -= entry.size
        this.stats.evictions++
        logger.cache.debug(`[${this.name}] Evicted: ${oldestKey}`)
      }
    }
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses
    this.stats.hitRate = total > 0 ? Math.round((this.stats.hits / total) * 100) : 0
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup()
    }, this.config.cleanupInterval)
  }

  private stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  private cleanup(): void {
    const expiredKeys: string[] = []

    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key)
      }
    }

    for (const key of expiredKeys) {
      this.delete(key)
    }

    if (expiredKeys.length > 0) {
      logger.cache.debug(`[${this.name}] Cleanup: removed ${expiredKeys.length} expired entries`)
    }
  }
}

// ===== 预定义的缓存实例 =====

/** 文件内容缓存 */
export const fileContentCache = new CacheService<string>('FileContent', {
  maxSize: 500,
  maxMemory: 100 * 1024 * 1024, // 100MB
  defaultTTL: 5 * 60 * 1000,    // 5 分钟
})

/** 语义搜索结果缓存 */
export const searchResultCache = new CacheService<unknown[]>('SearchResult', {
  maxSize: 100,
  maxMemory: 10 * 1024 * 1024,  // 10MB
  defaultTTL: 2 * 60 * 1000,    // 2 分钟
})

/** LLM 响应缓存（用于相同请求） */
export const llmResponseCache = new CacheService<string>('LLMResponse', {
  maxSize: 50,
  maxMemory: 20 * 1024 * 1024,  // 20MB
  defaultTTL: 10 * 60 * 1000,   // 10 分钟
})

export default CacheService
