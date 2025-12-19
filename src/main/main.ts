/**
 * Adnify Main Process
 * 重构后的主进程入口（支持多窗口和安全模块）
 */

import { app, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import Store from 'electron-store'
import { registerAllHandlers, cleanupAllHandlers, updateLLMServiceWindow } from './ipc'
import { lspManager } from './lspManager'
import { securityManager, updateWhitelist } from './security'

// ==========================================
// Store 初始化
// ==========================================

const bootstrapStore = new Store({ name: 'bootstrap' })
let mainStore: Store

function initStore() {
  const customPath = bootstrapStore.get('customConfigPath') as string | undefined
  if (customPath && fs.existsSync(customPath)) {
    console.log('[Main] Using custom config path:', customPath)
    mainStore = new Store({ cwd: customPath })
  } else {
    console.log('[Main] Using default config path')
    mainStore = new Store()
  }
}

initStore()

// ==========================================
// 全局状态
// ==========================================

const windows = new Map<number, BrowserWindow>()
let lastActiveWindow: BrowserWindow | null = null
let isQuitting = false

function getMainWindow() {
  return lastActiveWindow || Array.from(windows.values())[0] || null
}

// ==========================================
// 窗口创建
// ==========================================

function createWindow(isEmpty: boolean = false) {
  // 图标路径:开发环境用 public,生产环境用 resources
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../../public/icon.png')

  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    icon: iconPath,
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#09090b',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const windowId = win.id
  windows.set(windowId, win)
  lastActiveWindow = win

  win.on('focus', () => {
    lastActiveWindow = win
    updateLLMServiceWindow(win)
  })

  win.once('ready-to-show', () => {
    win.show()
    console.log(`[Main] Window ${windowId} shown`)
    if (!app.isPackaged) {
      win.webContents.openDevTools({ mode: 'detach' })
    }
  })

  win.on('close', async (e) => {
    if (windows.size === 1 && !isQuitting) {
      // 最后一个窗口关闭时，执行全局清理
      isQuitting = true
      e.preventDefault()
      console.log('[Main] Last window closing, starting cleanup...')
      try {
        cleanupAllHandlers()
        await lspManager.stopAllServers()
        console.log('[Main] Cleanup completed')
      } catch (err) {
        console.error('[Main] Cleanup error:', err)
      }
      win.destroy()
      app.quit()
    } else {
      // 非最后一个窗口，直接移除引用
      windows.delete(windowId)
      if (lastActiveWindow === win) {
        lastActiveWindow = Array.from(windows.values())[0] || null
      }
    }
  })

  // 加载页面
  const query = isEmpty ? '?empty=1' : ''
  if (!app.isPackaged) {
    win.loadURL(`http://localhost:5173${query}`)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'), { query: isEmpty ? { empty: '1' } : undefined })
  }

  return win
}

// ==========================================
// 应用生命周期
// ==========================================

app.whenReady().then(() => {
  console.log('[Security] 🔒 初始化安全模块...')

  const securityConfig = mainStore.get('securitySettings', {
    enablePermissionConfirm: true,
    enableAuditLog: true,
    strictWorkspaceMode: true,
    allowedShellCommands: ['npm', 'yarn', 'pnpm', 'node', 'npx', 'git', 'python', 'python3', 'java', 'go', 'rust', 'cargo', 'make', 'gcc', 'clang', 'pwd', 'ls', 'cat', 'echo', 'mkdir', 'touch', 'rm', 'mv', 'cd'],
    allowedGitSubcommands: ['status', 'log', 'diff', 'add', 'commit', 'push', 'pull', 'branch', 'checkout', 'merge', 'rebase', 'clone', 'remote', 'fetch', 'show', 'rev-parse', 'init'],
  }) as any

  securityManager.updateConfig(securityConfig)

  // 初始化白名单
  const shellCommands = securityConfig.allowedShellCommands || ['npm', 'yarn', 'pnpm', 'node', 'npx', 'git']
  const gitCommands = securityConfig.allowedGitSubcommands || ['status', 'log', 'diff', 'add', 'commit', 'push', 'pull', 'branch', 'checkout', 'merge', 'rebase', 'clone', 'remote', 'fetch', 'show', 'rev-parse', 'init']
  updateWhitelist(shellCommands, gitCommands)

  console.log('[Security] ✅ 安全模块已初始化')

  // 注册所有 IPC handlers
  registerAllHandlers({
    getMainWindow,
    createWindow,
    mainStore,
    bootstrapStore,
    setMainStore: (store) => {
      mainStore = store
    },
  })

  // 创建第一个窗口
  const firstWin = createWindow()
  securityManager.setMainWindow(firstWin)
})

// 处理第二个实例启动（打开新窗口）
app.on('second-instance', () => {
  createWindow(false)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (windows.size === 0) {
    createWindow()
  }
})
