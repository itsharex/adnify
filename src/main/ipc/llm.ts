/**
 * LLM IPC handlers
 * 
 * 支持功能：
 * - 流式对话
 * - 同步生成（后台任务）
 * - 结构化输出（代码分析、重构、修复、测试生成）
 * - 多窗口隔离
 */

import { logger } from '@shared/utils/Logger'
import { ipcMain, BrowserWindow } from 'electron'
import { LLMService } from '../services/llm'

// 按窗口 webContents.id 管理独立的 LLM 服务
const llmServices = new Map<number, LLMService>()
// 独立的压缩服务（不与主对话冲突）
const compactionServices = new Map<number, LLMService>()

/**
 * 获取或创建 LLM 服务实例
 */
function getOrCreateService(webContentsId: number, window: BrowserWindow): LLMService {
  if (!llmServices.has(webContentsId)) {
    logger.ipc.info('[LLMService] Creating new service for window:', webContentsId)
    llmServices.set(webContentsId, new LLMService(window))
  }
  return llmServices.get(webContentsId)!
}

/**
 * 获取或创建压缩服务实例
 */
function getOrCreateCompactionService(webContentsId: number, window: BrowserWindow): LLMService {
  if (!compactionServices.has(webContentsId)) {
    logger.ipc.info('[LLMService] Creating compaction service for window:', webContentsId)
    compactionServices.set(webContentsId, new LLMService(window))
  }
  return compactionServices.get(webContentsId)!
}

export function registerLLMHandlers(_getMainWindow: () => BrowserWindow | null) {
  // ============================================
  // 流式对话
  // ============================================

  ipcMain.handle('llm:sendMessage', async (event, params) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('Window not found for LLM request')

    const service = getOrCreateService(event.sender.id, window)
    await service.sendMessage(params)
  })

  ipcMain.on('llm:abort', (event) => {
    llmServices.get(event.sender.id)?.abort()
  })

  // ============================================
  // 同步生成
  // ============================================

  ipcMain.handle('llm:compactContext', async (event, params) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('Window not found for compaction request')

    const service = getOrCreateCompactionService(event.sender.id, window)
    
    try {
      return await service.sendMessageSync(params)
    } catch (error: unknown) {
      const err = error as { message?: string }
      logger.ipc.error('[LLMService] Compaction error:', error)
      return { error: err.message }
    }
  })

  // ============================================
  // 结构化输出 - 代码分析
  // ============================================

  ipcMain.handle('llm:analyzeCode', async (event, params) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('Window not found')

    const service = getOrCreateService(event.sender.id, window)
    
    try {
      return await service.analyzeCode(params)
    } catch (error: unknown) {
      const err = error as { message?: string }
      logger.ipc.error('[LLMService] Code analysis error:', error)
      throw new Error(err.message || 'Code analysis failed')
    }
  })

  ipcMain.handle('llm:analyzeCodeStream', async (event, params) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('Window not found')

    const service = getOrCreateService(event.sender.id, window)
    
    try {
      return await service.analyzeCodeStream(params, (partial) => {
        // 发送部分结果到渲染进程
        if (!window.isDestroyed()) {
          window.webContents.send('llm:analyzeCodePartial', partial)
        }
      })
    } catch (error: unknown) {
      const err = error as { message?: string }
      logger.ipc.error('[LLMService] Code analysis stream error:', error)
      throw new Error(err.message || 'Code analysis failed')
    }
  })

  // ============================================
  // 结构化输出 - 代码重构
  // ============================================

  ipcMain.handle('llm:suggestRefactoring', async (event, params) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('Window not found')

    const service = getOrCreateService(event.sender.id, window)
    
    try {
      return await service.suggestRefactoring(params)
    } catch (error: unknown) {
      const err = error as { message?: string }
      logger.ipc.error('[LLMService] Refactoring suggestion error:', error)
      throw new Error(err.message || 'Refactoring suggestion failed')
    }
  })

  // ============================================
  // 结构化输出 - 错误修复
  // ============================================

  ipcMain.handle('llm:suggestFixes', async (event, params) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('Window not found')

    const service = getOrCreateService(event.sender.id, window)
    
    try {
      return await service.suggestFixes(params)
    } catch (error: unknown) {
      const err = error as { message?: string }
      logger.ipc.error('[LLMService] Fix suggestion error:', error)
      throw new Error(err.message || 'Fix suggestion failed')
    }
  })

  // ============================================
  // 结构化输出 - 测试生成
  // ============================================

  ipcMain.handle('llm:generateTests', async (event, params) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('Window not found')

    const service = getOrCreateService(event.sender.id, window)
    
    try {
      return await service.generateTests(params)
    } catch (error: unknown) {
      const err = error as { message?: string }
      logger.ipc.error('[LLMService] Test generation error:', error)
      throw new Error(err.message || 'Test generation failed')
    }
  })
}

/**
 * 清理指定窗口的 LLM 服务（窗口关闭时调用）
 */
export function cleanupLLMService(webContentsId: number) {
  const service = llmServices.get(webContentsId)
  if (service) {
    logger.ipc.info('[LLMService] Cleaning up service for window:', webContentsId)
    service.destroy()
    llmServices.delete(webContentsId)
  }

  const compactionService = compactionServices.get(webContentsId)
  if (compactionService) {
    compactionService.destroy()
    compactionServices.delete(webContentsId)
  }
}
