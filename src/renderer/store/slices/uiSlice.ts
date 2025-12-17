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

  setActiveSidePanel: (panel: SidePanel) => void
  setTerminalVisible: (visible: boolean) => void
  setShowSettings: (show: boolean) => void
  setShowComposer: (show: boolean) => void
  setActiveDiff: (diff: DiffView | null) => void
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  activeSidePanel: 'explorer',
  terminalVisible: false,
  showSettings: false,
  showComposer: false,
  activeDiff: null,

  setActiveSidePanel: (panel) => set({ activeSidePanel: panel }),
  setTerminalVisible: (visible) => set({ terminalVisible: visible }),
  setShowSettings: (show) => set({ showSettings: show }),
  setShowComposer: (show) => set({ showComposer: show }),
  setActiveDiff: (diff) => set({ activeDiff: diff }),
})
