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

    const handleAddItem = () => {
        if (!newItemTitle.trim()) return
        onAddItem({ title: newItemTitle.trim() })
        setNewItemTitle('')
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleAddItem()
        }
    }

    const getStatusIcon = (status: PlanItem['status']) => {
        switch (status) {
            case 'completed':
                return <CheckCircle2 className="w-4 h-4 text-green-500" />
            case 'in_progress':
                return <Clock className="w-4 h-4 text-blue-500 animate-spin-slow" />
            case 'failed':
                return <XCircle className="w-4 h-4 text-red-500" />
            case 'skipped':
                return <AlertCircle className="w-4 h-4 text-gray-400" />
            default:
                return <Circle className="w-4 h-4 text-gray-500" />
        }
    }

    const getStatusColor = (status: PlanItem['status']) => {
        switch (status) {
            case 'completed':
                return 'text-green-500'
            case 'in_progress':
                return 'text-blue-500'
            case 'failed':
                return 'text-red-500'
            case 'skipped':
                return 'text-gray-400'
            default:
                return 'text-gray-300'
        }
    }

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] border-l border-[#333]">
            <div className="flex items-center justify-between p-4 border-b border-[#333]">
                <h2 className="text-sm font-semibold text-gray-200">Execution Plan</h2>
                <div className="flex items-center gap-2">
                    {plan.status === 'active' ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onUpdateStatus('completed')}
                            title="Complete Plan"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onUpdateStatus('active')}
                            title="Start Plan"
                        >
                            <Play className="w-4 h-4" />
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {plan.items.map((item) => (
                    <div
                        key={item.id}
                        className={`relative pl-6 pb-4 border-l-2 last:pb-0 transition-colors ${item.status === 'completed' ? "border-green-500/20" :
                            item.status === 'in_progress' ? "border-blue-500/50" : "border-[#333]"
                            }`}
                    >
                        <div className={`absolute -left-[9px] top-0 bg-[#1e1e1e] p-0.5 rounded-full ${item.status === 'in_progress' ? "ring-2 ring-blue-500/20" : ""
                            }`}>
                            {getStatusIcon(item.status)}
                        </div>

                        <div className="flex flex-col gap-1">
                            <div className="flex items-start justify-between group">
                                <span className={`text-sm font-medium transition-colors ${getStatusColor(item.status)} ${item.status === 'pending' ? "text-gray-400" : ""
                                    }`}>
                                    {item.title}
                                </span>

                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                    {item.status !== 'completed' && (
                                        <button
                                            onClick={() => onUpdateItem(item.id, { status: 'completed' })}
                                            className="p-1 hover:bg-[#333] rounded"
                                            title="Mark as Completed"
                                        >
                                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                                        </button>
                                    )}
                                    {item.status !== 'in_progress' && (
                                        <button
                                            onClick={() => {
                                                onUpdateItem(item.id, { status: 'in_progress' })
                                                onSetStep(item.id)
                                            }}
                                            className="p-1 hover:bg-[#333] rounded"
                                            title="Mark as In Progress"
                                        >
                                            <Play className="w-3 h-3 text-blue-500" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => onDeleteItem(item.id)}
                                        className="p-1 hover:bg-[#333] rounded"
                                        title="Delete Item"
                                    >
                                        <Trash2 className="w-3 h-3 text-gray-500 hover:text-red-500" />
                                    </button>
                                </div>
                            </div>

                            {item.description && (
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    {item.description}
                                </p>
                            )}
                        </div>
                    </div>
                ))}

                {/* Add Item Input */}
                <div className="relative pl-6 pt-2">
                    <div className="absolute -left-[5px] top-3 bg-[#1e1e1e] p-0.5 rounded-full">
                        <Circle className="w-3 h-3 text-gray-600" />
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newItemTitle}
                            onChange={(e) => setNewItemTitle(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Add new step..."
                            className="flex-1 bg-[#252526] border border-[#333] rounded px-2 py-1 text-sm text-gray-300 focus:outline-none focus:border-blue-500/50"
                        />
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleAddItem}
                            disabled={!newItemTitle.trim()}
                        >
                            <Plus className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <div className="p-2 border-t border-[#333] text-xs text-gray-500 flex justify-between">
                <span>{plan.items.filter(i => i.status === 'completed').length} / {plan.items.length} completed</span>
                <span className="capitalize">{plan.status}</span>
            </div>
        </div>
    )
}
