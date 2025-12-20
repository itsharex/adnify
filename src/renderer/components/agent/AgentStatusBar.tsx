/**
 * Agent 状态栏组件
 * Cursor 风格的底部状态栏 - 扁平化设计
 * 支持折叠、单条文件预览、接受、拒绝
 */

import { useState } from 'react'
import { X, Check, ExternalLink, Square, ChevronDown, ChevronRight } from 'lucide-react'
import { PendingChange } from '../../agent/core/types'
import { Button } from '../ui'

interface AgentStatusBarProps {
  pendingChanges: PendingChange[]
  isStreaming: boolean
  isAwaitingApproval: boolean
  streamingStatus?: string
  onStop?: () => void
  onReviewFile?: (filePath: string) => void
  onAcceptFile?: (filePath: string) => void
  onRejectFile?: (filePath: string) => void
  onUndoAll?: () => void
  onKeepAll?: () => void
}

export default function AgentStatusBar({
  pendingChanges,
  isStreaming,
  isAwaitingApproval,
  streamingStatus,
  onStop,
  onReviewFile,
  onAcceptFile,
  onRejectFile,
  onUndoAll,
  onKeepAll,
}: AgentStatusBarProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const hasChanges = pendingChanges.length > 0
  const showBar = isStreaming || isAwaitingApproval || hasChanges

  if (!showBar) return null

  return (
    <div className="bg-surface/10 border-b border-border-subtle animate-fade-in">
      {/* 顶部操作栏：文件标签 + 全局操作 */}
      {hasChanges && (
        <div className="flex items-center justify-between px-3 py-1.5">
          {/* 左侧：折叠按钮 + 文件标签 */}
          <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 text-text-muted hover:text-text-primary transition-colors hover:bg-surface/20 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
            <div className="flex items-center gap-1">
              {pendingChanges.slice(0, 3).map((change) => {
                const fileName = change.filePath.split(/[\\/]/).pop() || change.filePath
                return (
                  <button
                    key={change.id}
                    onClick={() => onReviewFile?.(change.filePath)}
                    className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface/20 rounded transition-all whitespace-nowrap border border-transparent hover:border-border-subtle"
                    title={change.filePath}
                  >
                    <span className="w-1 h-1 rounded-full bg-accent/50" />
                    {fileName}
                  </button>
                )
              })}
              {pendingChanges.length > 3 && (
                <span className="text-[10px] text-text-muted px-1.5 font-medium">
                  +{pendingChanges.length - 3}
                </span>
              )}
            </div>
          </div>

          {/* 右侧：全局操作 */}
          <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onUndoAll}
              className="h-6 px-2 text-[10px] text-text-muted hover:text-text-primary"
            >
              Undo All
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onKeepAll}
              className="h-6 px-3 text-[10px] shadow-lg shadow-accent/20"
            >
              Accept All
            </Button>
          </div>
        </div>
      )}

      {/* 文件列表 - 可折叠 */}
      {hasChanges && isExpanded && (
        <div className="max-h-40 overflow-y-auto border-t border-border-subtle custom-scrollbar bg-surface/20">
          {pendingChanges.map((change) => {
            const fileName = change.filePath.split(/[\\/]/).pop() || change.filePath
            return (
              <div
                key={change.id}
                className="group flex items-center gap-3 px-4 py-1.5 hover:bg-surface/20 transition-colors"
              >
                {/* 文件图标 + 名称 */}
                <div className="w-1.5 h-1.5 rounded-full bg-accent/40 group-hover:bg-accent transition-colors" />
                <span className="text-[11px] font-medium text-text-primary flex-1 truncate opacity-80 group-hover:opacity-100">
                  {fileName}
                </span>

                {/* 行数变化 */}
                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="text-green-400/80 group-hover:text-green-400">+{change.linesAdded}</span>
                  {change.linesRemoved > 0 && (
                    <span className="text-red-400/80 group-hover:text-red-400">-{change.linesRemoved}</span>
                  )}
                </div>

                {/* 单条操作按钮 - hover 时显示 */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                  <button
                    onClick={() => onRejectFile?.(change.filePath)}
                    className="p-1 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                    title="Reject this change"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onAcceptFile?.(change.filePath)}
                    className="p-1 text-text-muted hover:text-green-400 hover:bg-green-500/10 rounded transition-colors"
                    title="Accept this change"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onReviewFile?.(change.filePath)}
                    className="p-1 text-text-muted hover:text-accent hover:bg-accent/10 rounded transition-colors"
                    title="Review in diff view"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 流式状态 / 等待审批状态 */}
      {(isStreaming || isAwaitingApproval) && (
        <div className="flex items-center justify-between px-4 py-1.5 border-t border-border-subtle bg-accent/5">
          <div className="flex items-center gap-3">
            {isStreaming && (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="w-1.5 h-1.5 bg-accent rounded-full animate-ping absolute inset-0" />
                  <div className="w-1.5 h-1.5 bg-accent rounded-full relative" />
                </div>
                <span className="text-[10px] font-medium text-accent uppercase tracking-wider animate-pulse">
                  {streamingStatus}
                </span>
              </div>
            )}
            {isAwaitingApproval && !isStreaming && (
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                <span className="text-[10px] font-medium text-amber-400 uppercase tracking-wider">
                  Waiting for approval
                </span>
              </div>
            )}
          </div>
          {isStreaming && (
            <button
              onClick={onStop}
              className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-all uppercase tracking-tighter"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
              Stop
            </button>
          )}
        </div>
      )}
    </div>
  )
}
