import { CheckCircle2, Circle, Clock, AlertCircle, XCircle, Play, Trash2, Plus } from 'lucide-react'
import { Plan, PlanItem } from '@/renderer/agent/core/types'
import { Button } from '../ui'
import { useState } from 'react'

interface PlanListProps {
    plan: Plan
    onUpdateStatus: (status: Plan['status']) => void
    onUpdateItem: (itemId: string, updates: Partial<PlanItem>) => void
    onAddItem: (item: { title: string; description?: string }) => void
    onDeleteItem: (itemId: string) => void
    onSetStep: (stepId: string | null) => void
}

export default function PlanList({ plan, onUpdateStatus, onUpdateItem, onAddItem, onDeleteItem, onSetStep }: PlanListProps) {
    const [newItemTitle, setNewItemTitle] = useState('')
    const [isAdding, setIsAdding] = useState(false)

    const handleAddItem = () => {
        if (!newItemTitle.trim()) return
        onAddItem({ title: newItemTitle.trim() })
        setNewItemTitle('')
        setIsAdding(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleAddItem()
        } else if (e.key === 'Escape') {
            setIsAdding(false)
            setNewItemTitle('')
        }
    }

    const getStatusIcon = (status: PlanItem['status']) => {
        switch (status) {
            case 'completed':
                return <CheckCircle2 className="w-4 h-4 text-green-400" />
            case 'in_progress':
                return (
                    <div className="relative">
                        <div className="absolute inset-0 bg-blue-400/20 rounded-full animate-ping" />
                        <Clock className="w-4 h-4 text-blue-400 relative z-10 animate-pulse" />
                    </div>
                )
            case 'failed':
                return <XCircle className="w-4 h-4 text-red-400" />
            case 'skipped':
                return <AlertCircle className="w-4 h-4 text-text-muted" />
            default:
                return <Circle className="w-4 h-4 text-text-muted/40" />
        }
    }

    const completedCount = plan.items.filter(i => i.status === 'completed').length
    const progress = plan.items.length > 0 ? (completedCount / plan.items.length) * 100 : 0

    return (
        <div className="flex flex-col h-full bg-surface/10 backdrop-blur-xl border-l border-white/5 select-none animate-fade-in">
            {/* Header */}
            <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-accent/10 rounded-lg">
                            <Play className="w-3.5 h-3.5 text-accent" />
                        </div>
                        <div>
                            <h2 className="text-xs font-bold tracking-wider text-text-primary uppercase">Execution Plan</h2>
                            <p className="text-[10px] text-text-muted font-medium">
                                {completedCount} of {plan.items.length} steps completed
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {plan.status === 'active' ? (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onUpdateStatus('completed')}
                                className="h-7 px-2.5 text-[10px] font-bold text-green-400 hover:bg-green-400/10"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                FINISH
                            </Button>
                        ) : (
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => onUpdateStatus('active')}
                                className="h-7 px-3 text-[10px] font-bold shadow-lg shadow-accent/20"
                            >
                                <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                                START
                            </Button>
                        )}
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-accent to-accent-hover transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(var(--color-accent),0.3)]"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* Items List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                {plan.items.map((item, index) => (
                    <div
                        key={item.id}
                        className={`group relative p-3 rounded-xl border transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.99]
                            ${item.status === 'in_progress'
                                ? 'bg-accent/5 border-accent/30 shadow-lg shadow-accent/5'
                                : item.status === 'completed'
                                    ? 'bg-green-400/[0.02] border-green-400/10 opacity-80'
                                    : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04]'
                            }`}
                    >
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex-shrink-0">
                                {getStatusIcon(item.status)}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                    <span className={`text-xs font-semibold leading-snug transition-colors
                                        ${item.status === 'in_progress' ? 'text-accent' :
                                            item.status === 'completed' ? 'text-green-400/80 line-through' :
                                                'text-text-primary'
                                        }`}>
                                        {item.title}
                                    </span>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                                        {item.status !== 'completed' && (
                                            <button
                                                onClick={() => onUpdateItem(item.id, { status: 'completed' })}
                                                className="p-1 text-text-muted hover:text-green-400 hover:bg-green-400/10 rounded-md transition-colors"
                                                title="Mark as Completed"
                                            >
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        {item.status !== 'in_progress' && (
                                            <button
                                                onClick={() => {
                                                    onUpdateItem(item.id, { status: 'in_progress' })
                                                    onSetStep(item.id)
                                                }}
                                                className="p-1 text-text-muted hover:text-accent hover:bg-accent/10 rounded-md transition-colors"
                                                title="Start this step"
                                            >
                                                <Play className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => onDeleteItem(item.id)}
                                            className="p-1 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                                            title="Delete step"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {item.description && (
                                    <p className="mt-1 text-[10px] text-text-muted leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all">
                                        {item.description}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Step Number Badge */}
                        <div className="absolute -right-1 -top-1 w-5 h-5 bg-white/5 border border-white/5 rounded-full flex items-center justify-center text-[8px] font-bold text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                            {index + 1}
                        </div>
                    </div>
                ))}

                {/* Add Step Area */}
                {isAdding ? (
                    <div className="p-3 bg-accent/5 border border-accent/20 rounded-xl animate-scale-in">
                        <input
                            autoFocus
                            type="text"
                            value={newItemTitle}
                            onChange={(e) => setNewItemTitle(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={() => !newItemTitle.trim() && setIsAdding(false)}
                            placeholder="What's the next step?"
                            className="w-full bg-transparent border-none p-0 text-xs text-text-primary placeholder-text-muted/50 focus:ring-0"
                        />
                        <div className="flex justify-end gap-2 mt-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setIsAdding(false); setNewItemTitle('') }}
                                className="h-6 px-2 text-[10px] font-bold"
                            >
                                CANCEL
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleAddItem}
                                disabled={!newItemTitle.trim()}
                                className="h-6 px-3 text-[10px] font-bold"
                            >
                                ADD STEP
                            </Button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="w-full py-3 border border-dashed border-white/10 rounded-xl text-[10px] font-bold text-text-muted hover:text-accent hover:border-accent/30 hover:bg-accent/5 transition-all flex items-center justify-center gap-2 group"
                    >
                        <Plus className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform" />
                        ADD NEW STEP
                    </button>
                )}
            </div>

            {/* Footer */}
            <div className="p-2 px-4 border-t border-white/5 bg-white/[0.01] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${plan.status === 'active' ? 'bg-accent animate-pulse' : 'bg-text-muted/40'}`} />
                    <span className="text-[10px] font-bold tracking-widest text-text-muted uppercase">
                        Status: {plan.status}
                    </span>
                </div>
                <span className="text-[10px] font-mono text-text-muted opacity-40">
                    {progress.toFixed(0)}% COMPLETE
                </span>
            </div>
        </div>
    )
}
