/**
 * 工具调用卡片 - Cursor 风格设计
 * 支持流式参数预览、状态指示、结果展示
 */

import { useStore } from '../../store'
import { t } from '../../i18n'
import { useState, useMemo } from 'react'
import { 
  Check, X, ChevronDown, ChevronRight, Loader2, 
  Terminal, Search, FolderOpen, FileText, Edit3, 
  Trash2, Eye, Copy, ExternalLink
} from 'lucide-react'
import { ToolCall } from '../../agent/core/types'

interface ToolCallCardProps {
  toolCall: ToolCall
  isAwaitingApproval?: boolean
  onApprove?: () => void
  onReject?: () => void
  onOpenDiff?: (filePath: string, oldContent: string, newContent: string) => void
}

// 工具图标映射
const TOOL_ICONS: Record<string, React.ReactNode> = {
  run_command: <Terminal className="w-3.5 h-3.5" />,
  search_files: <Search className="w-3.5 h-3.5" />,
  list_directory: <FolderOpen className="w-3.5 h-3.5" />,
  read_file: <Eye className="w-3.5 h-3.5" />,
  write_file: <Edit3 className="w-3.5 h-3.5" />,
  create_file: <FileText className="w-3.5 h-3.5" />,
  edit_file: <Edit3 className="w-3.5 h-3.5" />,
  delete_file_or_folder: <Trash2 className="w-3.5 h-3.5" />,
}

// 工具标签映射
const TOOL_LABELS: Record<string, string> = {
  run_command: 'Run Command',
  search_files: 'Search Files',
  list_directory: 'List Directory',
  read_file: 'Read File',
  write_file: 'Write File',
  create_file: 'Create File',
  edit_file: 'Edit File',
  delete_file_or_folder: 'Delete',
}

// 工具颜色映射
const TOOL_COLORS: Record<string, string> = {
  run_command: 'text-green-400',
  search_files: 'text-blue-400',
  list_directory: 'text-yellow-400',
  read_file: 'text-cyan-400',
  write_file: 'text-purple-400',
  create_file: 'text-emerald-400',
  edit_file: 'text-orange-400',
  delete_file_or_folder: 'text-red-400',
}

export default function ToolCallCard({
  toolCall,
  isAwaitingApproval,
  onApprove,
  onReject,
  onOpenDiff,
}: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { language } = useStore()

  const args = toolCall.arguments as Record<string, unknown>
  const isStreaming = args._streaming === true
  const isRunning = toolCall.status === 'running' || toolCall.status === 'pending'
  const isSuccess = toolCall.status === 'success'
  const isError = toolCall.status === 'error'
  const isRejected = toolCall.status === 'rejected'
  
  // 获取简短描述
  const description = useMemo(() => {
    const name = toolCall.name
    if (name === 'run_command') {
      const cmd = args.command as string
      return cmd?.length > 60 ? cmd.slice(0, 60) + '...' : cmd
    }
    if (name === 'read_file' || name === 'write_file' || name === 'create_file' || name === 'edit_file') {
      const path = args.path as string
      return path?.split(/[\\/]/).pop() || path
    }
    if (name === 'search_files') return `"${args.query}"`
    if (name === 'list_directory') {
      const path = args.path as string
      return path?.split(/[\\/]/).pop() || path || '.'
    }
    if (name === 'delete_file_or_folder') {
      const path = args.path as string
      return path?.split(/[\\/]/).pop() || path
    }
    return ''
  }, [toolCall.name, args])

  // 复制结果到剪贴板
  const handleCopyResult = () => {
    if (toolCall.result) {
      navigator.clipboard.writeText(toolCall.result)
    }
  }

  // 状态指示器
  const StatusIndicator = () => {
    if (isStreaming) {
      return (
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
          <span className="text-[10px] text-accent">{t('toolStreaming', language)}</span>
        </div>
      )
    }
    if (isRunning) {
      return <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
    }
    if (isSuccess) {
      return <Check className="w-3.5 h-3.5 text-green-400" />
    }
    if (isError) {
      return <X className="w-3.5 h-3.5 text-red-400" />
    }
    if (isRejected) {
      return <X className="w-3.5 h-3.5 text-yellow-400" />
    }
    return null
  }

  return (
    <div className={`my-1.5 rounded-lg border overflow-hidden transition-all ${
      isAwaitingApproval 
        ? 'border-yellow-500/30 bg-yellow-500/5' 
        : isError 
          ? 'border-red-500/20 bg-red-500/5'
          : 'border-border-subtle/30 bg-surface/10'
    }`}>
      {/* 头部 */}
      <div 
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <button className="p-0.5 hover:bg-white/10 rounded transition-colors">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
          )}
        </button>
        
        <span className={TOOL_COLORS[toolCall.name] || 'text-text-muted'}>
          {TOOL_ICONS[toolCall.name] || <span className="text-xs">⚡</span>}
        </span>
        
        <span className="text-xs font-medium text-text-secondary">
          {TOOL_LABELS[toolCall.name] || toolCall.name}
        </span>
        
        {description && (
          <>
            <span className="text-text-muted/30">•</span>
            <span className="text-xs text-text-muted flex-1 truncate font-mono">
              {description}
            </span>
          </>
        )}
        
        <StatusIndicator />
      </div>
      
      {/* 展开的详情 */}
      {isExpanded && (
        <div className="border-t border-border-subtle/20">
          {/* 参数预览 */}
          {Object.keys(args).filter(k => !k.startsWith('_')).length > 0 && (
            <div className="px-3 py-2 bg-black/20">
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{t('toolArguments', language)}</div>
              <div className="space-y-1">
                {Object.entries(args)
                  .filter(([key]) => !key.startsWith('_'))
                  .map(([key, value]) => (
                    <div key={key} className="flex gap-2 text-xs">
                      <span className="text-text-muted shrink-0">{key}:</span>
                      <span className="text-text-secondary font-mono truncate">
                        {typeof value === 'string' 
                          ? value.length > 100 ? value.slice(0, 100) + '...' : value
                          : JSON.stringify(value)
                        }
                      </span>
                    </div>
                  ))
                }
              </div>
            </div>
          )}
          
          {/* 结果 */}
          {toolCall.result && (
            <div className="border-t border-border-subtle/20">
              <div className="flex items-center justify-between px-3 py-1 bg-black/10">
                <span className="text-[10px] text-text-muted uppercase tracking-wider">{t('toolResult', language)}</span>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleCopyResult() }}
                  className="p-1 hover:bg-white/10 rounded text-text-muted hover:text-text-primary transition-colors"
                  title="Copy result"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
              <div className="max-h-40 overflow-auto">
                <pre className="px-3 py-2 text-[11px] font-mono text-text-muted whitespace-pre-wrap break-all">
                  {toolCall.result.slice(0, 500)}
                  {toolCall.result.length > 500 && '\n... (truncated)'}
                </pre>
              </div>
            </div>
          )}
          
          {/* 错误信息 */}
          {toolCall.error && (
            <div className="px-3 py-2 bg-red-500/10 border-t border-red-500/20">
              <div className="text-[10px] text-red-400 uppercase tracking-wider mb-1">{t('toolError', language)}</div>
              <p className="text-xs text-red-300">{toolCall.error}</p>
            </div>
          )}
        </div>
      )}
      
      {/* 审批按钮 */}
      {isAwaitingApproval && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-yellow-500/20 bg-yellow-500/5">
          <span className="text-xs text-yellow-400">{t('toolWaitingApproval', language)}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onReject}
              className="px-3 py-1 text-xs text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
            >
              {t('toolReject', language)}
            </button>
            <button
              onClick={onApprove}
              className="px-3 py-1 text-xs bg-green-600 text-white hover:bg-green-700 rounded transition-colors"
            >
              {t('toolApprove', language)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
