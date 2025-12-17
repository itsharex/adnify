/**
 * 自定义确认对话框组件
 * 替代原生 window.confirm，支持国际化和自定义样式
 */
import { useEffect, useRef, useState, useCallback, createContext, useContext, ReactNode } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useStore } from '../store'
import { t } from '../i18n'

interface ConfirmDialogProps {
  isOpen: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  variant = 'warning',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { language } = useStore()
  const dialogRef = useRef<HTMLDivElement>(null)

  // 按 Escape 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onCancel()
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const variantStyles = {
    danger: {
      icon: 'text-red-400 bg-red-500/10',
      button: 'bg-red-600 hover:bg-red-700',
    },
    warning: {
      icon: 'text-yellow-400 bg-yellow-500/10',
      button: 'bg-yellow-600 hover:bg-yellow-700',
    },
    info: {
      icon: 'text-blue-400 bg-blue-500/10',
      button: 'bg-accent hover:bg-accent-hover',
    },
  }

  const styles = variantStyles[variant]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div
        ref={dialogRef}
        className="bg-background border border-border-subtle rounded-xl shadow-2xl max-w-md w-full mx-4 animate-scale-in"
      >
        <div className="flex items-start gap-4 p-5">
          <div className={`p-2 rounded-lg ${styles.icon}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            {title && (
              <h3 className="text-sm font-semibold text-text-primary mb-1">
                {title}
              </h3>
            )}
            <p className="text-sm text-text-secondary leading-relaxed">
              {message}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-surface-hover rounded-lg transition-colors text-text-muted hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-subtle bg-surface/30">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
          >
            {cancelText || t('cancel', language)}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm text-white rounded-lg transition-colors ${styles.button}`}
          >
            {confirmText || 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============ Hook 版本 ============

interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
}

export function useConfirmDialog() {
  const [state, setState] = useState<{
    isOpen: boolean
    options: ConfirmOptions | null
    resolve: ((value: boolean) => void) | null
  }>({
    isOpen: false,
    options: null,
    resolve: null,
  })

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        options,
        resolve,
      })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    state.resolve?.(true)
    setState({ isOpen: false, options: null, resolve: null })
  }, [state.resolve])

  const handleCancel = useCallback(() => {
    state.resolve?.(false)
    setState({ isOpen: false, options: null, resolve: null })
  }, [state.resolve])

  const DialogComponent = state.options ? (
    <ConfirmDialog
      isOpen={state.isOpen}
      {...state.options}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null

  return { confirm, DialogComponent }
}

// ============ 全局确认对话框 ============

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextType | null>(null)

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const { confirm, DialogComponent } = useConfirmDialog()

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {DialogComponent}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const context = useContext(ConfirmContext)
  if (!context) {
    throw new Error('useConfirm must be used within ConfirmDialogProvider')
  }
  return context.confirm
}

// ============ 简单的全局 confirm 函数（不依赖 Context） ============

let globalResolve: ((value: boolean) => void) | null = null
let globalSetState: ((state: { isOpen: boolean; options: ConfirmOptions | null }) => void) | null = null

export function GlobalConfirmDialog() {
  const [state, setState] = useState<{
    isOpen: boolean
    options: ConfirmOptions | null
  }>({
    isOpen: false,
    options: null,
  })

  useEffect(() => {
    globalSetState = setState
    return () => {
      globalSetState = null
    }
  }, [])

  const handleConfirm = useCallback(() => {
    globalResolve?.(true)
    globalResolve = null
    setState({ isOpen: false, options: null })
  }, [])

  const handleCancel = useCallback(() => {
    globalResolve?.(false)
    globalResolve = null
    setState({ isOpen: false, options: null })
  }, [])

  if (!state.options) return null

  return (
    <ConfirmDialog
      isOpen={state.isOpen}
      {...state.options}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  )
}

/**
 * 全局确认函数，可以在任何地方调用
 * 需要在 App 根组件中渲染 <GlobalConfirmDialog />
 */
export function globalConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!globalSetState) {
      // 如果没有挂载 GlobalConfirmDialog，回退到原生 confirm
      console.warn('GlobalConfirmDialog not mounted, falling back to native confirm')
      resolve(window.confirm(options.message))
      return
    }
    globalResolve = resolve
    globalSetState({ isOpen: true, options })
  })
}
