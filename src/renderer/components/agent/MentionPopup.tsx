import { useState, useEffect, useRef } from 'react'
import { Search, Sparkles } from 'lucide-react'
import { t } from '@/renderer/i18n'
import { MentionCandidate } from '@/renderer/agent/core/MentionParser'
import { useStore } from '@/renderer/store'

interface MentionPopupProps {
    position: { x: number; y: number }
    query: string
    candidates: MentionCandidate[]
    loading: boolean
    onSelect: (candidate: MentionCandidate) => void
    onClose: () => void
}

export default function MentionPopup({
    position,
    query,
    candidates,
    loading,
    onSelect,
    onClose,
}: MentionPopupProps) {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const listRef = useRef<HTMLDivElement>(null)
    const { language } = useStore()

    // Reset selection when candidates change
    useEffect(() => {
        setSelectedIndex(0)
    }, [candidates])

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault()
                    e.stopPropagation()
                    setSelectedIndex(i => Math.min(i + 1, candidates.length - 1))
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    e.stopPropagation()
                    setSelectedIndex(i => Math.max(i - 1, 0))
                    break
                case 'Enter':
                case 'Tab':
                    e.preventDefault()
                    e.stopPropagation()
                    if (candidates[selectedIndex]) {
                        onSelect(candidates[selectedIndex])
                    }
                    break
                case 'Escape':
                    e.preventDefault()
                    e.stopPropagation()
                    onClose()
                    break
            }
        }

        window.addEventListener('keydown', handleKeyDown, true)
        return () => window.removeEventListener('keydown', handleKeyDown, true)
    }, [candidates, selectedIndex, onSelect, onClose])

    // Scroll to selected
    useEffect(() => {
        if (listRef.current) {
            const selectedEl = listRef.current.children[selectedIndex] as HTMLElement
            if (selectedEl) {
                selectedEl.scrollIntoView({ block: 'nearest' })
            }
        }
    }, [selectedIndex])

    return (
        <div
            className="fixed z-50 bg-surface border border-border-subtle rounded-lg shadow-xl overflow-hidden animate-fade-in"
            style={{
                left: position.x,
                bottom: `calc(100vh - ${position.y}px + 8px)`,
                minWidth: 300,
                maxWidth: 400,
                maxHeight: 320,
            }}
        >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle bg-surface-hover">
                <Search className="w-3.5 h-3.5 text-text-muted" />
                <span className="text-xs text-text-muted">
                    {query ? `${t('searching', language)}: ${query}` : t('selectFileToReference', language)}
                </span>
            </div>

            {/* List */}
            <div ref={listRef} className="overflow-y-auto max-h-[240px]">
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : candidates.length === 0 ? (
                    <div className="py-8 text-center text-text-muted text-sm">
                        {query ? t('noResultsFound', language) : t('noFilesInWorkspace', language)}
                    </div>
                ) : (
                    candidates.map((candidate, index) => {
                        const Icon = candidate.icon
                        return (
                            <div
                                key={candidate.id}
                                onClick={() => onSelect(candidate)}
                                className={`
                  flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors
                  ${index === selectedIndex ? 'bg-accent/20 text-text-primary' : 'hover:bg-surface-hover text-text-secondary'}
                `}
                            >
                                {Icon && <Icon className={`w-4 h-4 flex-shrink-0 ${candidate.type === 'file' ? 'text-text-muted' : 'text-accent'}`} />}
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm truncate">{candidate.label}</div>
                                    {candidate.description && (
                                        <div className="text-[10px] text-text-muted truncate">{candidate.description}</div>
                                    )}
                                </div>
                                {candidate.type === 'codebase' && <Sparkles className="w-3 h-3 text-purple-400" />}
                            </div>
                        )
                    })
                )}
            </div>

            {/* Footer */}
            <div className="px-3 py-1.5 border-t border-border-subtle bg-surface-hover text-[10px] text-text-muted flex items-center justify-between">
                <span>↑↓ {t('navigate', language)}</span>
                <span>↵ {t('selectItem', language)}</span>
                <span>Esc {t('closeMenu', language)}</span>
            </div>
        </div>
    )
}
