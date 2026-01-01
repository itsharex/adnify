/**
 * Store slices 导出
 * 
 * 注意：chatSlice 已迁移到 AgentStore
 */

export { createFileSlice } from './fileSlice'
export type { FileSlice, OpenFile, FileItem } from './fileSlice'

export { createSettingsSlice } from './settingsSlice'
export type { SettingsSlice, ProviderType, LLMConfig, AutoApproveSettings } from './settingsSlice'

export { createUISlice } from './uiSlice'
export type { UISlice, SidePanel, DiffView } from './uiSlice'
