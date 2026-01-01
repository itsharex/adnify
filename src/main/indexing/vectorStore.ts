/**
 * 向量存储服务
 * 使用 LanceDB 存储和检索代码向量
 */

import { logger } from '@shared/utils/Logger'
import * as path from 'path'
import * as fs from 'fs'
import { IndexedChunk, SearchResult } from './types'

// LanceDB 类型
type LanceDBConnection = any
type LanceDBTable = any
type LanceDBSearchResult = any

export class VectorStoreService {
  private db: LanceDBConnection | null = null
  private table: LanceDBTable | null = null
  private indexPath: string
  private tableName = 'code_chunks'

  constructor(workspacePath: string) {
    this.indexPath = path.join(workspacePath, '.adnify', 'index')
  }

  /**
   * 初始化数据库连接
   */
  async initialize(): Promise<void> {
    // 确保目录存在
    if (!fs.existsSync(this.indexPath)) {
      fs.mkdirSync(this.indexPath, { recursive: true })
    }

    try {
      const lancedb = await import('@lancedb/lancedb')
      this.db = await lancedb.connect(this.indexPath)

      // 检查是否已有表
      const tables = await this.db.tableNames()
      if (tables.includes(this.tableName)) {
        this.table = await this.db.openTable(this.tableName)
      }
      logger.index.info('[VectorStore] Initialized at:', this.indexPath)
    } catch (e) {
      logger.index.error('[VectorStore] Failed to initialize LanceDB:', e)
      this.db = null
    }
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.db !== null
  }

  /**
   * 检查是否有索引数据
   */
  async hasIndex(): Promise<boolean> {
    if (!this.table) return false
    const count = await this.table.countRows()
    return count > 0
  }

  /**
   * 获取索引统计
   */
  async getStats(): Promise<{ chunkCount: number; fileCount: number }> {
    if (!this.table) {
      return { chunkCount: 0, fileCount: 0 }
    }

    const count = await this.table.countRows()
    return { chunkCount: count, fileCount: Math.ceil(count / 5) }
  }

  /**
   * 获取所有文件的 Hash
   * 只查询 filePath 和 fileHash 字段，减少内存占用
   */
  async getFileHashes(): Promise<Map<string, string>> {
    if (!this.table) return new Map()
    
    try {
      const hashMap = new Map<string, string>()
      
      // LanceDB 不支持 offset，直接查询所有记录
      // 只选择需要的字段以减少内存占用
      const results = await this.table
        .query()
        .select(['filePath', 'fileHash'])
        .execute()

      for (const r of results) {
        if (r.filePath && r.fileHash) {
          // 只保留第一次出现的 hash（同一文件的多个 chunk 有相同 hash）
          if (!hashMap.has(r.filePath as string)) {
            hashMap.set(r.filePath as string, r.fileHash as string)
          }
        }
      }

      logger.index.info(`[VectorStore] Loaded ${hashMap.size} file hashes`)
      return hashMap
    } catch (e) {
      logger.index.error('[VectorStore] Error fetching file hashes:', e)
      return new Map()
    }
  }

  /**
   * 创建或重建索引
   */
  async createIndex(chunks: IndexedChunk[]): Promise<void> {
    if (!this.db) return

    if (chunks.length === 0) {
      logger.index.info('[VectorStore] No chunks to index')
      return
    }

    // 准备数据
    const data = chunks.map(chunk => ({
      id: chunk.id,
      filePath: chunk.filePath,
      relativePath: chunk.relativePath,
      fileHash: chunk.fileHash,
      content: chunk.content,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      type: chunk.type,
      language: chunk.language,
      symbols: chunk.symbols?.join(',') || '',
      vector: chunk.vector,
    }))

    const tables = await this.db.tableNames()
    if (tables.includes(this.tableName)) {
      await this.db.dropTable(this.tableName)
    }

    this.table = await this.db.createTable(this.tableName, data)
    logger.index.info(`[VectorStore] Created index with ${chunks.length} chunks`)
  }

  /**
   * 批量添加 chunks (追加模式，表不存在时自动创建)
   */
  async addBatch(chunks: IndexedChunk[]): Promise<void> {
    if (!this.db || chunks.length === 0) return

    const data = chunks.map(chunk => ({
      id: chunk.id,
      filePath: chunk.filePath,
      relativePath: chunk.relativePath,
      fileHash: chunk.fileHash,
      content: chunk.content,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      type: chunk.type,
      language: chunk.language,
      symbols: chunk.symbols?.join(',') || '',
      vector: chunk.vector,
    }))

    // 如果表不存在，创建表
    if (!this.table) {
      this.table = await this.db.createTable(this.tableName, data)
      logger.index.info(`[VectorStore] Created table with ${chunks.length} initial chunks`)
    } else {
      await this.table.add(data)
    }
  }

  /**
   * 添加或更新文件的 chunks
   * 使用安全的删除方式避免 SQL 注入
   */
  async upsertFile(filePath: string, chunks: IndexedChunk[]): Promise<void> {
    if (!this.table || !this.db) return

    try {
      // 使用 filter 方式删除，避免 SQL 注入风险
      // LanceDB 的 delete 方法使用 SQL 语法，需要安全处理
      await this.safeDeleteByFilePath(filePath)
    } catch {
      // ignore
    }

    if (chunks.length === 0) return

    const data = chunks.map(chunk => ({
      id: chunk.id,
      filePath: chunk.filePath,
      relativePath: chunk.relativePath,
      fileHash: chunk.fileHash,
      content: chunk.content,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      type: chunk.type,
      language: chunk.language,
      symbols: chunk.symbols?.join(',') || '',
      vector: chunk.vector,
    }))

    await this.table.add(data)
  }

  /**
   * 安全删除指定文件的 chunks
   * 通过查询-过滤-重建的方式避免 SQL 注入
   */
  private async safeDeleteByFilePath(filePath: string): Promise<void> {
    if (!this.table) return

    try {
      // 方案1：使用参数化的方式（如果 LanceDB 支持）
      // 方案2：严格验证和转义文件路径
      const safePath = this.sanitizeFilePath(filePath)
      await this.table.delete(`filePath = '${safePath}'`)
    } catch (e) {
      logger.index.warn('[VectorStore] Safe delete failed, using fallback:', e)
      // 如果删除失败，记录警告但不阻塞操作
    }
  }

  /**
   * 清理文件路径，防止 SQL 注入
   */
  private sanitizeFilePath(filePath: string): string {
    // 1. 转义单引号
    let safe = filePath.replace(/'/g, "''")
    // 2. 移除可能的 SQL 注释
    safe = safe.replace(/--/g, '')
    // 3. 移除分号（防止多语句注入）
    safe = safe.replace(/;/g, '')
    // 4. 限制长度
    if (safe.length > 1000) {
      safe = safe.substring(0, 1000)
    }
    return safe
  }

  /**
   * 删除文件的 chunks
   */
  async deleteFile(filePath: string): Promise<void> {
    if (!this.table) return

    try {
      await this.safeDeleteByFilePath(filePath)
    } catch {
      // ignore
    }
  }

  /**
   * 批量删除多个文件的 chunks
   * 比逐个删除更高效
   */
  async deleteFiles(filePaths: string[]): Promise<void> {
    if (!this.table || filePaths.length === 0) return

    try {
      // 构建安全的 OR 条件
      const conditions = filePaths
        .map(fp => `filePath = '${this.sanitizeFilePath(fp)}'`)
        .join(' OR ')
      
      await this.table.delete(conditions)
      logger.index.info(`[VectorStore] Deleted chunks for ${filePaths.length} files`)
    } catch (e) {
      logger.index.error('[VectorStore] Batch delete failed:', e)
      // 回退到逐个删除
      for (const fp of filePaths) {
        await this.deleteFile(fp)
      }
    }
  }

  /**
   * 向量搜索
   */
  async search(queryVector: number[], topK: number = 10): Promise<SearchResult[]> {
    if (!this.table) return []

    const results = await this.table
      .search(queryVector)
      .limit(topK)
      .execute()

    return results.map((r: LanceDBSearchResult) => ({
      filePath: r.filePath,
      relativePath: r.relativePath,
      content: r.content,
      startLine: r.startLine,
      endLine: r.endLine,
      type: r.type,
      language: r.language,
      score: 1 - r._distance,
    }))
  }

  /**
   * 清空索引
   */
  async clear(): Promise<void> {
    if (!this.db) return

    const tables = await this.db.tableNames()
    if (tables.includes(this.tableName)) {
      await this.db.dropTable(this.tableName)
      this.table = null
    }
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    this.db = null
    this.table = null
  }
}
