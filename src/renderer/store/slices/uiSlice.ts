/**
 * UI 相关状态切片
 */
import { StateCreator } from 'zustand'

export type SidePanel = 'explorer' | 'search' | 'git' | 'problems' | 'outline' | 'extensions' | null

export interface DiffView {
  original: string
  modified: string
  filePath: string
}

export interface UISlice {
  activeSidePanel: SidePanel
  terminalVisible: boolean
  showSettings: boolean
  showComposer: boolean
  activeDiff: DiffView | null
  sidebarWidth: number
  chatWidth: number
  terminalLayout: 'tabs' | 'split'

  setActiveSidePanel: (panel: SidePanel) => void
  setTerminalVisible: (visible: boolean) => void
  setShowSettings: (show: boolean) => void
  setShowComposer: (show: boolean) => void
  setActiveDiff: (diff: DiffView | null) => void
  setSidebarWidth: (width: number) => void
  setChatWidth: (width: number) => void
  setTerminalLayout: (layout: 'tabs' | 'split') => void
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  activeSidePanel: 'explorer',
  terminalVisible: false,
  showSettings: false,
  showComposer: false,
  activeDiff: null,
  sidebarWidth: 260,
  chatWidth: 450,
  terminalLayout: 'tabs',

  setActiveSidePanel: (panel) => set({ activeSidePanel: panel }),
  setTerminalVisible: (visible) => set({ terminalVisible: visible }),
  setShowSettings: (show) => set({ showSettings: show }),
  setShowComposer: (show) => set({ showComposer: show }),
  setActiveDiff: (diff) => set({ activeDiff: diff }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setChatWidth: (width) => set({ chatWidth: width }),
  setTerminalLayout: (layout) => set({ terminalLayout: layout }),
})
