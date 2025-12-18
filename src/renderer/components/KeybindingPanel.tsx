
import { useEffect, useState } from 'react'
import { Search, RotateCcw } from 'lucide-react'
import { keybindingService, Command } from '../services/keybindingService'
import { registerCoreCommands } from '../config/commands'

export default function KeybindingPanel() {
    const [commands, setCommands] = useState<Command[]>([])
    const [bindings, setBindings] = useState<Record<string, string>>({})
    const [searchQuery, setSearchQuery] = useState('')
    const [recordingId, setRecordingId] = useState<string | null>(null)

    useEffect(() => {
        registerCoreCommands()
        keybindingService.init().then(() => {
            loadData()
        })
    }, [])

    const loadData = () => {
        setCommands(keybindingService.getAllCommands())
        const newBindings: Record<string, string> = {}
        keybindingService.getAllCommands().forEach(cmd => {
            const binding = keybindingService.getBinding(cmd.id)
            if (binding) newBindings[cmd.id] = binding
        })
        setBindings(newBindings)
    }

    const handleKeyDown = async (e: React.KeyboardEvent) => {
        if (!recordingId) return
        e.preventDefault()
        e.stopPropagation()

        const modifiers = []
        if (e.ctrlKey) modifiers.push('Ctrl')
        if (e.shiftKey) modifiers.push('Shift')
        if (e.altKey) modifiers.push('Alt')
        if (e.metaKey) modifiers.push('Meta')

        let key = e.key
        if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') return

        if (key === ' ') key = 'Space'
        if (key.length === 1) key = key.toUpperCase()

        const binding = [...modifiers, key].join('+')

        await keybindingService.updateBinding(recordingId, binding)
        setRecordingId(null)
        loadData()
    }

    const handleReset = async (id: string) => {
        await keybindingService.resetBinding(id)
        loadData()
    }

    const filteredCommands = commands.filter(cmd =>
        cmd.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (cmd.category && cmd.category.toLowerCase().includes(searchQuery.toLowerCase()))
    )

    return (
        <div className="flex flex-col h-full bg-background text-text-primary">
            <div className="p-4 border-b border-border-subtle flex items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                        type="text"
                        placeholder="Search keybindings..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-surface border border-border-subtle rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-accent"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-1">
                    {filteredCommands.map(cmd => (
                        <div key={cmd.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-surface-hover group">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-medium">{cmd.title}</span>
                                <span className="text-xs text-text-muted">{cmd.category} • {cmd.id}</span>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setRecordingId(cmd.id)}
                                    className="px-3 py-1.5 bg-surface border border-border-subtle rounded text-xs font-mono min-w-[80px] text-center hover:border-accent transition-colors"
                                >
                                    {bindings[cmd.id] || '-'}
                                </button>

                                {keybindingService.isOverridden(cmd.id) && (
                                    <button
                                        onClick={() => handleReset(cmd.id)}
                                        className="p-1.5 text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Reset to default"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Recording Modal */}
            {recordingId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRecordingId(null)}>
                    <div className="bg-surface p-6 rounded-lg shadow-xl border border-border-subtle flex flex-col items-center gap-4 min-w-[300px]" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-medium">Press desired key combination</h3>
                        <p className="text-text-muted text-sm">Press Esc to cancel</p>

                        <div className="px-4 py-2 bg-background rounded border border-border-subtle text-xl font-mono min-w-[120px] text-center">
                            Recording...
                        </div>

                        <input
                            autoFocus
                            readOnly
                            className="w-0 h-0 opacity-0"
                            onKeyDown={e => {
                                if (e.key === 'Escape') {
                                    setRecordingId(null)
                                    return
                                }
                                handleKeyDown(e)
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
