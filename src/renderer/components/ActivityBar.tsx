import { Files, Search, GitBranch, Settings, Sparkles, AlertCircle, ListTree } from 'lucide-react'
import { useStore } from '../store'
import { t } from '../i18n'

export default function ActivityBar() {
  const { activeSidePanel, setActiveSidePanel, language, setShowSettings, setShowComposer } = useStore()

  const items = [
    { id: 'explorer', icon: Files, label: t('explorer', language) },
    { id: 'search', icon: Search, label: t('search', language) },
    { id: 'git', icon: GitBranch, label: 'Git' },
    { id: 'problems', icon: AlertCircle, label: language === 'zh' ? '问题' : 'Problems' },
    { id: 'outline', icon: ListTree, label: language === 'zh' ? '大纲' : 'Outline' },
  ] as const

  return (
    <div className="w-12 bg-background flex flex-col items-center py-4 border-r border-border-subtle z-20">
      {/* Top Actions */}
      <div className="flex-1 flex flex-col gap-4 w-full px-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveSidePanel(activeSidePanel === item.id ? null : item.id)}
            className={`
              w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 group relative
              ${activeSidePanel === item.id
                ? 'bg-accent/10 text-accent'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'}
            `}
            title={item.label}
          >
            <item.icon className="w-5 h-5" strokeWidth={1.5} />
            {/* Active Indicator */}
            {activeSidePanel === item.id && (
              <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-accent rounded-r-full" />
            )}
          </button>
        ))}
      </div>

      {/* Bottom Actions */}
      <div className="flex flex-col gap-4 w-full px-2 mb-2">
         <button
            onClick={() => setShowComposer(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all"
            title={`${t('composer', language)} (Ctrl+Shift+I)`}
          >
            <Sparkles className="w-5 h-5" strokeWidth={1.5} />
          </button>
         <button
            onClick={() => setShowSettings(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all"
            title={t('settings', language)}
          >
            <Settings className="w-5 h-5" strokeWidth={1.5} />
          </button>
      </div>
    </div>
  )
}
