import { Files, Search, GitBranch, Settings, Sparkles, AlertCircle, ListTree, History } from 'lucide-react'
import { Tooltip } from '../ui/Tooltip'
import { useStore } from '@store'
import { t } from '@renderer/i18n'

export default function ActivityBar() {
  const { activeSidePanel, setActiveSidePanel, language, setShowSettings, setShowComposer } = useStore()

  const items = [
    { id: 'explorer', icon: Files, label: t('explorer', language) },
    { id: 'search', icon: Search, label: t('search', language) },
    { id: 'git', icon: GitBranch, label: 'Git' },
    { id: 'problems', icon: AlertCircle, label: language === 'zh' ? '问题' : 'Problems' },
    { id: 'outline', icon: ListTree, label: language === 'zh' ? '大纲' : 'Outline' },
    { id: 'history', icon: History, label: language === 'zh' ? '历史' : 'History' },
  ] as const

  return (
    <div className="w-[50px] bg-background border-r border-border flex flex-col z-30 select-none">
      {/* Top Actions */}
      <div className="flex-1 flex flex-col w-full pt-2">
        {items.map((item, index) => (
          <Tooltip key={item.id} content={item.label} side="right">
            <button
              onClick={() => setActiveSidePanel(activeSidePanel === item.id ? null : item.id)}
              className={`
                w-full min-h-[48px] flex items-center justify-center transition-all duration-200 group relative
                ${activeSidePanel === item.id
                  ? 'text-accent'
                  : 'text-text-muted hover:text-text-primary hover:bg-white/5'}
              `}
              style={{
                marginBottom: index < items.length - 1 ? '2px' : '0',
              }}
            >
              <div className="w-5 h-5 flex items-center justify-center">
                <item.icon
                  className={`w-5 h-5 transition-all duration-300 ${activeSidePanel === item.id ? 'drop-shadow-[0_0_8px_rgba(var(--accent)/0.4)]' : ''}`}
                  strokeWidth={1.5}
                />
              </div>

              {/* Active Indicator */}
              {activeSidePanel === item.id && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 bg-accent rounded-r-full shadow-[0_0_10px_rgba(var(--accent)/0.6)]" />
              )}
            </button>
          </Tooltip>
        ))}
      </div>

      {/* Bottom Actions */}
      <div className="flex flex-col w-full pb-2">
        <Tooltip content={`${t('composer', language)} (Ctrl+Shift+I)`} side="right">
          <button
            onClick={() => setShowComposer(true)}
            className="w-full min-h-[48px] flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-white/5 transition-all duration-200 group mb-2"
          >
            <div className="w-5 h-5 flex items-center justify-center">
              <Sparkles className="w-5 h-5 group-hover:text-accent transition-colors group-hover:drop-shadow-[0_0_8px_rgba(var(--accent)/0.4)]" strokeWidth={1.5} />
            </div>
          </button>
        </Tooltip>
        <Tooltip content={t('settings', language)} side="right">
          <button
            onClick={() => setShowSettings(true)}
            className="w-full min-h-[48px] flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-white/5 transition-all duration-200 group"
          >
            <div className="w-5 h-5 flex items-center justify-center">
              <Settings className="w-5 h-5 group-hover:rotate-45 transition-transform duration-500" strokeWidth={1.5} />
            </div>
          </button>
        </Tooltip>
      </div>
    </div>
  )
}