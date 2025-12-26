/**
 * 文件监听服务
 * 从 secureFile.ts 拆分出来的文件监听功能
 */

import { logger } from '@shared/utils/Logger'
import { FileChangeBuffer, createFileChangeHandler } from '../indexing/fileChangeBuffer'
import { getIndexService } from '../indexing/indexService'

export interface FileWatcherEvent {
  event: 'create' | 'update' | 'delete'
  path: string
}

export interface FileWatcherConfig {
  ignored: (string | RegExp)[]
  persistent: boolean
  ignoreInitial: boolean
  bufferTimeMs: number
  maxBufferSize: number
  maxWaitTimeMs: number
}

const DEFAULT_CONFIG: FileWatcherConfig = {
  ignored: [/node_modules/, /\.git/, /dist/, /build/, /\.adnify/, '**/*.tmp', '**/*.temp'],
  persistent: true,
  ignoreInitial: true,
  bufferTimeMs: 500,
  maxBufferSize: 50,
  maxWaitTimeMs: 5000,
}

let watcherSubscription: any = null
let fileChangeBuffer: FileChangeBuffer | null = null

/**
 * 设置文件监听器
 */
export function setupFileWatcher(
  getWorkspaceSessionFn: () => { roots: string[] } | null,
  callback: (data: FileWatcherEvent) => void,
  config?: Partial<FileWatcherConfig>
): void {
  const workspace = getWorkspaceSessionFn()
  if (!workspace || workspace.roots.length === 0) return

  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  // 动态导入 chokidar
  const chokidar = require('chokidar')
  const watcher = chokidar.watch(workspace.roots, {
    ignored: mergedConfig.ignored,
    persistent: mergedConfig.persistent,
    ignoreInitial: mergedConfig.ignoreInitial,
  })

  // 使用工厂函数创建文件变更缓冲器
  const indexService = getIndexService(workspace.roots[0])
  fileChangeBuffer = createFileChangeHandler(indexService, {
    bufferTimeMs: mergedConfig.bufferTimeMs,
    maxBufferSize: mergedConfig.maxBufferSize,
    maxWaitTimeMs: mergedConfig.maxWaitTimeMs,
  })

  watcherSubscription = watcher
    .on('add', (filePath: string) => {
      callback({ event: 'create', path: filePath })
      fileChangeBuffer?.add({ type: 'create', path: filePath, timestamp: Date.now() })
    })
    .on('change', (filePath: string) => {
      callback({ event: 'update', path: filePath })
      fileChangeBuffer?.add({ type: 'update', path: filePath, timestamp: Date.now() })
    })
    .on('unlink', (filePath: string) => {
      callback({ event: 'delete', path: filePath })
      fileChangeBuffer?.add({ type: 'delete', path: filePath, timestamp: Date.now() })
    })
    .on('error', (error: Error) => logger.security.error('[Watcher] Error:', error))

  // 保存到全局以便调试
  ;(global as any).fileWatcher = watcher

  logger.security.info('[Watcher] File watcher started for:', workspace.roots)
}

/**
 * 清理文件监听器
 */
export function cleanupFileWatcher(): void {
  // 清理文件变更缓冲器
  if (fileChangeBuffer) {
    fileChangeBuffer.destroy()
    fileChangeBuffer = null
  }

  if (watcherSubscription) {
    logger.security.info('[Watcher] Cleaning up file watcher...')
    const subscription = watcherSubscription
    watcherSubscription = null
    subscription.close().catch((e: any) => {
      logger.security.info('[Watcher] Cleanup completed (ignored error):', e.message)
    })
  }
}

/**
 * 获取监听器状态
 */
export function getWatcherStatus(): {
  isActive: boolean
  hasBuffer: boolean
  bufferSize: number
} {
  return {
    isActive: watcherSubscription !== null,
    hasBuffer: fileChangeBuffer !== null,
    bufferSize: fileChangeBuffer?.size() ?? 0,
  }
}

/**
 * 强制刷新缓冲区
 */
export function flushBuffer(): void {
  fileChangeBuffer?.flush()
}
