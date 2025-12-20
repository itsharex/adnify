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

// 共享安全常量（与 renderer 保持一致）
const SECURITY_DEFAULTS = {
  SHELL_COMMANDS: [
    // 包管理器
    'npm', 'yarn', 'pnpm', 'bun',
    // 运行时
    'node', 'npx', 'deno',
    // 版本控制
    'git',
    // 编程语言
    'python', 'python3', 'pip', 'pip3',
    'java', 'javac', 'mvn', 'gradle',
    'go', 'rust', 'cargo',
    // 构建工具
    'make', 'gcc', 'clang', 'cmake',
    // 常用命令
    'pwd', 'ls', 'dir', 'cat', 'type', 'echo', 'mkdir', 'touch', 'rm', 'mv', 'cp', 'cd',
  ],
  GIT_SUBCOMMANDS: [
    'status', 'log', 'diff', 'add', 'commit', 'push', 'pull',
    'branch', 'checkout', 'merge', 'rebase', 'clone', 'remote',
    'fetch', 'show', 'rev-parse', 'init', 'stash', 'tag',
  ],
} as const

// ==========================================
// Store & Path 初始化
// ==========================================

// 1. 优先初始化 bootstrapStore (存储在默认位置)
const bootstrapStore = new Store({ name: 'bootstrap' })

// 2. 检查是否有自定义数据路径
const customDataPath = bootstrapStore.get('customConfigPath') as string | undefined
if (customDataPath && fs.existsSync(customDataPath)) {
  console.log('[Main] Setting custom userData path:', customDataPath)
  app.setPath('userData', customDataPath)
}

let mainStore: Store

function initStore() {
  console.log('[Main] Initializing main store at:', app.getPath('userData'))
  // 此时 new Store() 会自动使用 app.getPath('userData')
  mainStore = new Store({ name: 'config' })
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

// 单例锁定
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

// ==========================================
// 窗口创建
// ==========================================

function createWindow(isEmpty: boolean = false) {
  // 图标路径：开发环境用 public，生产环境用 resources
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

  // 注册快捷键监听 (Frameless window workaround)
  win.webContents.on('before-input-event', (_, input) => {
    // Ctrl+Shift+P: Command Palette
    if ((input.control && input.shift && input.key.toLowerCase() === 'p') || input.key === 'F1') {
      if (input.type === 'keyDown') {
        // Do NOT prevent default, let it propagate to renderer as fallback
        // event.preventDefault() 
        win.webContents.send('workbench:execute-command', 'workbench.action.showCommands')
      }
    }
    // F12: Toggle DevTools
    if (input.key === 'F12' && input.type === 'keyDown') {
      // Do NOT prevent default, let it propagate to renderer as fallback
      // event.preventDefault()
      win.webContents.toggleDevTools()
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
    allowedShellCommands: [...SECURITY_DEFAULTS.SHELL_COMMANDS],
    allowedGitSubcommands: [...SECURITY_DEFAULTS.GIT_SUBCOMMANDS],
  }) as any

  securityManager.updateConfig(securityConfig)

  // 初始化白名单
  const shellCommands = securityConfig.allowedShellCommands || [...SECURITY_DEFAULTS.SHELL_COMMANDS]
  const gitCommands = securityConfig.allowedGitSubcommands || [...SECURITY_DEFAULTS.GIT_SUBCOMMANDS]
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

  // 创建应用菜单
  const { Menu } = require('electron')
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        {
          label: 'Command Palette',
          // accelerator: 'Ctrl+Shift+P', // Remove accelerator to let renderer handle it
          click: (_: any, focusedWindow: BrowserWindow) => {
            console.log('[Main] Menu: Command Palette triggered')
            if (focusedWindow) {
              console.log('[Main] Sending workbench:execute-command to renderer')
              focusedWindow.webContents.send('workbench:execute-command', 'workbench.action.showCommands')
            } else {
              console.log('[Main] No focused window to send command to')
            }
          }
        }
      ]
    }
  ]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

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
