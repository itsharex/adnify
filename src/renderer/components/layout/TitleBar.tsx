import { api } from '@/renderer/services/electronAPI'
import { Minus, Square, X, Search, HelpCircle } from 'lucide-react'
import { useStore } from '@store'
import { Logo } from '../common/Logo'
import WorkspaceDropdown from './WorkspaceDropdown'
import UpdateIndicator from './UpdateIndicator'

// 检测是否为 Mac 平台
const isMac = typeof navigator !== 'undefined' && (
  navigator.platform.toUpperCase().indexOf('MAC') >= 0 ||
  (navigator as any).userAgentData?.platform?.toUpperCase().indexOf('MAC') >= 0
)

export default function TitleBar() {
  const { setShowQuickOpen, setShowAbout } = useStore()
  return (
    <div className="h-11 flex items-center justify-between px-0 drag-region select-none bg-background-secondary/30 backdrop-blur-2xl z-50">

      {/* Left - Branding */}
      <div className={`flex items-center gap-3 min-w-[200px] w-1/3 h-full ${isMac ? 'pl-[80px]' : 'pl-4'}`}>
        <div className="flex items-center gap-2.5 opacity-80 hover:opacity-100 transition-all cursor-default group no-drag">
          <Logo className="w-5 h-5 transition-all duration-500 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(var(--accent)/0.5)] flex-shrink-0" glow />
          <span className="text-[10px] font-bold text-text-primary tracking-[0.25em] font-sans uppercase leading-tight opacity-70 group-hover:opacity-100 transition-opacity">ADNIFY</span>
        </div>
        <div className="h-4 w-[1px] bg-white/10 mx-2" />
        <div className="no-drag">
          <WorkspaceDropdown />
        </div>
      </div>

      {/* Center - Command Palette */}
      <div className="flex-1 flex justify-center min-w-0 px-4">
        <div
          onClick={() => setShowQuickOpen(true)}
          className="no-drag flex items-center gap-3 px-4 h-9 w-full max-w-[520px] rounded-xl bg-surface/10 border border-white/5 hover:border-accent/30 hover:bg-surface/20 transition-all duration-300 cursor-pointer group shadow-[0_2px_12px_-4px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.05)]"
        >
          <Search className="w-4 h-4 text-text-muted/60 group-hover:text-accent transition-all duration-300 group-hover:scale-110" />
          <span className="text-xs text-text-muted/80 group-hover:text-text-primary transition-colors font-medium truncate">Search files...</span>
          <div className="flex items-center gap-1.5 ml-auto shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
            <kbd className="hidden sm:inline-block font-mono bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5 text-[10px] text-text-muted font-bold tracking-tighter">⌘ P</kbd>
          </div>
        </div>
      </div>

      {/* Right - Window Controls (Refined) */}
      <div className="flex items-center justify-end min-w-[160px] w-1/3 h-full pr-3">
        <div className="no-drag flex items-center gap-1.5 h-full">
          {/* Update Indicator */}
          <UpdateIndicator />

          {/* About Button */}
          <button
            onClick={() => setShowAbout(true)}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-white/5 transition-all active:scale-95"
            title="About Adnify"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Windows 上显示自定义窗口控制按钮，Mac 上隐藏（使用系统默认） */}
          {!isMac && (
            <>
              <div className="w-[1px] h-3.5 bg-white/10 mx-1.5" />

              {/* Windows Control Buttons Group */}
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => api.window.minimize()}
                  className="w-9 h-8 rounded-xl flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-white/5 transition-all"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => api.window.maximize()}
                  className="w-9 h-8 rounded-xl flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-white/5 transition-all"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => api.window.close()}
                  className="w-9 h-8 rounded-xl flex items-center justify-center text-text-muted hover:text-white hover:bg-red-500/80 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}