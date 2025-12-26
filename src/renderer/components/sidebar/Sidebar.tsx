/**
 * Sidebar 主组件
 * 根据 activeSidePanel 状态渲染对应的面板视图
 */

import { useStore } from '@store'
import { ExplorerView } from './panels/ExplorerView'
import { SearchView } from './panels/SearchView'
import { GitView } from './panels/GitView'
import { ProblemsView } from './panels/ProblemsView'
import { OutlineView } from './panels/OutlineView'
import { HistoryView } from './panels/HistoryView'

export default function Sidebar() {
    const { activeSidePanel } = useStore()

    if (!activeSidePanel) return null

    return (
        <div className="w-full bg-background/60 backdrop-blur-xl border-r border-white/5 flex flex-col h-full animate-slide-in relative z-10 shadow-2xl shadow-black/50">
            {activeSidePanel === 'explorer' && <ExplorerView />}
            {activeSidePanel === 'search' && <SearchView />}
            {activeSidePanel === 'git' && <GitView />}
            {activeSidePanel === 'problems' && <ProblemsView />}
            {activeSidePanel === 'outline' && <OutlineView />}
            {activeSidePanel === 'history' && <HistoryView />}
        </div>
    )
}
