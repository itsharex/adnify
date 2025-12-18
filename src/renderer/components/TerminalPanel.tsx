import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { X, Plus, Trash2, ChevronUp, ChevronDown, Terminal as TerminalIcon, Sparkles, Play, SplitSquareHorizontal, LayoutTemplate } from 'lucide-react'
import { useStore } from '../store'
import { getEditorConfig } from '../config/editorConfig'
import { themes } from './ThemeManager'

const XTERM_STYLE = `
.xterm { font-feature-settings: "liga" 0; position: relative; user-select: none; -ms-user-select: none; -webkit-user-select: none; padding: 4px; }
.xterm.focus, .xterm:focus { outline: none; }
.xterm .xterm-helpers { position: absolute; z-index: 5; }
.xterm .xterm-helper-textarea { padding: 0; border: 0; margin: 0; position: absolute; opacity: 0; left: -9999em; top: 0; width: 0; height: 0; z-index: -5; overflow: hidden; white-space: nowrap; }
.xterm .composition-view { background: #000; color: #FFF; display: none; position: absolute; white-space: pre; z-index: 1; }
.xterm .composition-view.active { display: block; }
.xterm .xterm-viewport { background-color: #18181b; overflow-y: scroll; cursor: default; position: absolute; right: 0; left: 0; top: 0; bottom: 0; }
.xterm .xterm-screen { position: relative; }
.xterm .xterm-screen canvas { position: absolute; left: 0; top: 0; }
.xterm .xterm-scroll-area { visibility: hidden; }
.xterm-char-measure-element { display: inline-block; visibility: hidden; position: absolute; left: -9999em; top: 0; }
.xterm.enable-mouse-events { cursor: default; }
.xterm.xterm-cursor-pointer { cursor: pointer; }
.xterm.xterm-cursor-crosshair { cursor: crosshair; }
.xterm .xterm-accessibility, .xterm .xterm-message-overlay { position: absolute; left: 0; top: 0; bottom: 0; right: 0; z-index: 10; color: transparent; }
.xterm-live-region { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
.xterm-dim { opacity: 0.5; }
.xterm-underline { text-decoration: underline; }
.xterm-selection-layer { position: absolute; top: 0; left: 0; z-index: 1; pointer-events: none; }
.xterm-cursor-layer { position: absolute; top: 0; left: 0; z-index: 2; pointer-events: none; }
.xterm-link-layer { position: absolute; top: 0; left: 0; z-index: 11; pointer-events: none; }
.xterm-link-layer a { cursor: pointer; color: #3b82f6; text-decoration: underline; }
`

interface TerminalSession {
    id: string
    name: string
    shell: string
}

export default function TerminalPanel() {
    const { terminalVisible, setTerminalVisible, workspacePath, setChatMode, setInputPrompt, currentTheme, terminalLayout, setTerminalLayout } = useStore()
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [height, setHeight] = useState(280)
    const [isResizing, setIsResizing] = useState(false)

    // Derived state for compatibility
    const isSplitView = terminalLayout === 'split'
    const setIsSplitView = (value: boolean) => setTerminalLayout(value ? 'split' : 'tabs')

    // Multi-terminal state
    const [terminals, setTerminals] = useState<TerminalSession[]>([])
    const [activeId, setActiveId] = useState<string | null>(null)
    const [availableShells, setAvailableShells] = useState<{ label: string, path: string }[]>([])
    const [showShellMenu, setShowShellMenu] = useState(false)

    // Run Task state
    const [scripts, setScripts] = useState<Record<string, string>>({})
    const [showScriptMenu, setShowScriptMenu] = useState(false)

    // Refs for managing instances
    const terminalRefs = useRef<Map<string, XTerminal>>(new Map())
    const addonRefs = useRef<Map<string, FitAddon>>(new Map())
    const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map())
    const outputBuffers = useRef<Map<string, string[]>>(new Map())

    // Resize handler
    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        setIsResizing(true)
    }, [])

    useEffect(() => {
        if (!isResizing) return

        const handleMouseMove = (e: MouseEvent) => {
            // Calculate new height based on mouse position relative to window bottom
            // Assuming status bar is approx 24px
            const newHeight = window.innerHeight - e.clientY - 24
            if (newHeight > 100 && newHeight < window.innerHeight - 100) {
                setHeight(newHeight)
            }
        }

        const stopResizing = () => {
            setIsResizing(false)
            // Trigger resize fit for terminal
            if (activeId) {
                const addon = addonRefs.current.get(activeId)
                addon?.fit()
            }
        }

        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', stopResizing)
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', stopResizing)
        }
    }, [isResizing, activeId])

    // Load available shells from main process
    useEffect(() => {
        const loadShells = async () => {
            try {
                const shells = await window.electronAPI.getAvailableShells()
                setAvailableShells(shells)
            } catch {
                // Fallback
                setAvailableShells([{ label: 'Terminal', path: '' }])
            }
        }
        loadShells()
    }, [])

    // Load scripts from package.json
    useEffect(() => {
        const loadScripts = async () => {
            if (!workspacePath) return
            try {
                const content = await window.electronAPI.readFile(`${workspacePath}/package.json`)
                if (content) {
                    const pkg = JSON.parse(content)
                    if (pkg.scripts) {
                        setScripts(pkg.scripts)
                    }
                }
            } catch (e) {
                console.error('Failed to load package.json scripts:', e)
            }
        }
        loadScripts()
    }, [workspacePath])

    // Create initial terminal if none exist and visible
    // 等待 shells 加载完成后再创建
    useEffect(() => {
        if (terminalVisible && terminals.length === 0 && availableShells.length > 0) {
            createTerminal()
        }
    }, [terminalVisible, availableShells.length])

    // Resize observer for active terminal
    useEffect(() => {
        if (!terminalVisible || isCollapsed || !activeId) return

        const handleResize = () => {
            // In split view, we need to fit all visible terminals
            if (isSplitView) {
                terminals.forEach(t => {
                    const addon = addonRefs.current.get(t.id)
                    if (addon) {
                        try {
                            addon.fit()
                            // Sync size to backend
                            const dims = addon.proposeDimensions()
                            if (dims && dims.cols > 0 && dims.rows > 0) {
                                window.electronAPI.resizeTerminal(t.id, dims.cols, dims.rows)
                            }
                        } catch (e) { console.error(e) }
                    }
                })
            } else {
                const addon = addonRefs.current.get(activeId)
                if (addon) {
                    try {
                        addon.fit()
                        // Sync size to backend
                        const dims = addon.proposeDimensions()
                        if (dims && dims.cols > 0 && dims.rows > 0) {
                            window.electronAPI.resizeTerminal(activeId, dims.cols, dims.rows)
                        }
                    } catch (e) { console.error(e) }
                }
            }
        }

        window.addEventListener('resize', handleResize)
        // Initial fit
        setTimeout(handleResize, 100)

        return () => window.removeEventListener('resize', handleResize)
    }, [terminalVisible, isCollapsed, activeId, height, isSplitView, terminals.length])

    // Data listener (Global)
    useEffect(() => {
        const unsubscribe = window.electronAPI.onTerminalData(({ id, data }: { id?: string, data: string }) => {
            const targetId = id || activeId
            if (!targetId) return

            const term = terminalRefs.current.get(targetId)
            if (term) {
                term.write(data)

                // Buffer for AI Fix
                if (!outputBuffers.current.has(targetId)) {
                    outputBuffers.current.set(targetId, [])
                }
                const buffer = outputBuffers.current.get(targetId)!
                buffer.push(data)
                const bufferSize = getEditorConfig().performance.terminalBufferSize
                if (buffer.length > bufferSize) buffer.shift()
            }
        })
        return unsubscribe
    }, [activeId])

    // 主题变化时更新所有终端
    useEffect(() => {
        const newTheme = getTerminalTheme()
        terminalRefs.current.forEach((term) => {
            term.options.theme = newTheme
        })
    }, [currentTheme])

    // 根据全局主题生成终端主题
    const getTerminalTheme = () => {
        const themeVars = themes[currentTheme as keyof typeof themes]
        const rgbToHex = (rgb: string) => {
            const [r, g, b] = rgb.split(' ').map(Number)
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
        }
        return {
            background: rgbToHex(themeVars['--color-surface']),
            foreground: rgbToHex(themeVars['--color-text-primary']),
            cursor: rgbToHex(themeVars['--color-text-secondary']),
            selectionBackground: rgbToHex(themeVars['--color-accent']),
            selectionForeground: '#ffffff',
            black: rgbToHex(themeVars['--color-surface']),
            red: '#ef4444',
            green: '#22c55e',
            yellow: '#eab308',
            blue: rgbToHex(themeVars['--color-accent']),
            magenta: '#a855f7',
            cyan: '#06b6d4',
            white: rgbToHex(themeVars['--color-text-primary']),
        }
    }

    const createTerminal = async (shellPath?: string, shellName?: string) => {
        const id = crypto.randomUUID()
        // 使用传入的名称，或者使用第一个可用 shell 的名称，或默认 Terminal
        const name = shellName || availableShells[0]?.label || 'Terminal'

        setTerminals(prev => [...prev, { id, name, shell: shellPath || '' }])
        setActiveId(id)
        setShowShellMenu(false)

        // Defer creation until DOM is ready
        setTimeout(async () => {
            const container = containerRefs.current.get(id)
            if (!container) return

            const termConfig = getEditorConfig().terminal
            const term = new XTerminal({
                cursorBlink: termConfig.cursorBlink,
                fontFamily: termConfig.fontFamily,
                fontSize: termConfig.fontSize,
                lineHeight: termConfig.lineHeight,
                scrollback: termConfig.scrollback,
                theme: getTerminalTheme(),
                allowProposedApi: true
            })

            const fitAddon = new FitAddon()
            const webLinksAddon = new WebLinksAddon()
            term.loadAddon(fitAddon)
            term.loadAddon(webLinksAddon)

            term.open(container)

            // 加载 WebGL 渲染器 - 选中层会渲染在文字层后面
            try {
                const webglAddon = new WebglAddon()
                term.loadAddon(webglAddon)
                webglAddon.onContextLoss(() => {
                    webglAddon.dispose()
                })
            } catch (e) {
                console.warn('WebGL addon failed to load:', e)
            }
            term.onData((data: string) => {
                window.electronAPI.writeTerminal(id, data)
            })

            terminalRefs.current.set(id, term)
            addonRefs.current.set(id, fitAddon)

            try {
                fitAddon.fit()
            } catch { }

            // Call backend
            await window.electronAPI.createTerminal({ id, cwd: workspacePath || undefined, shell: shellPath })

            // Initial size sync
            const dims = fitAddon.proposeDimensions()
            if (dims && dims.cols > 0 && dims.rows > 0) {
                window.electronAPI.resizeTerminal(id, dims.cols, dims.rows)
            }

            // Register File Link Provider
            term.registerLinkProvider({
                provideLinks(bufferLineNumber: number, callback: (links: any[]) => void) {
                    const line = term.buffer.active.getLine(bufferLineNumber - 1)
                    if (!line) {
                        callback([])
                        return
                    }
                    const text = line.translateToString(true)
                    const links: any[] = []

                    // Regex for file paths: path/to/file.ext:line:col
                    const regex = /(?:^|\s|")((?:[a-zA-Z]:[\\/]|[.\/])[\w\-.\\/ ]+\.[a-zA-Z0-9]+)(?::(\d+))?(?::(\d+))?/g

                    let match
                    while ((match = regex.exec(text)) !== null) {
                        const [fullMatch, filePath, lineNum, colNum] = match
                        const startIndex = match.index + fullMatch.indexOf(filePath)
                        const length = fullMatch.length - fullMatch.indexOf(filePath)

                        links.push({
                            range: {
                                start: { x: startIndex + 1, y: bufferLineNumber },
                                end: { x: startIndex + length + 1, y: bufferLineNumber }
                            },
                            text: fullMatch,
                            activate: async (_e: MouseEvent, _text: string) => {
                                const cleanPath = filePath.trim()
                                const fullPath = cleanPath.startsWith('.') && workspacePath
                                    ? `${workspacePath}/${cleanPath}`.replace(/\\/g, '/')
                                    : cleanPath

                                try {
                                    const content = await window.electronAPI.readFile(fullPath)
                                    if (content !== null) {
                                        const { openFile } = useStore.getState()
                                        openFile(fullPath, content)

                                        if (lineNum) {
                                            setTimeout(() => {
                                                window.dispatchEvent(new CustomEvent('editor:goto-line', {
                                                    detail: {
                                                        line: parseInt(lineNum),
                                                        column: colNum ? parseInt(colNum) : 1
                                                    }
                                                }))
                                            }, 100)
                                        }
                                    }
                                } catch (err) {
                                    console.error('Failed to open file link:', err)
                                }
                            }
                        })
                    }
                    callback(links)
                }
            })

        }, 50)
    }

    const closeTerminal = (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation()

        // Cleanup ref
        terminalRefs.current.get(id)?.dispose()
        terminalRefs.current.delete(id)
        addonRefs.current.delete(id)
        containerRefs.current.delete(id)
        outputBuffers.current.delete(id)

        // Notify backend
        window.electronAPI.killTerminal(id)

        setTerminals(prev => {
            const newTerminals = prev.filter(t => t.id !== id)
            if (activeId === id && newTerminals.length > 0) {
                setActiveId(newTerminals[newTerminals.length - 1].id)
            } else if (newTerminals.length === 0) {
                setActiveId(null)
            }
            // Auto-exit split view if only 1 terminal remains
            if (newTerminals.length <= 1) {
                setIsSplitView(false)
            }
            return newTerminals
        })
    }

    const handleFixWithAI = () => {
        if (!activeId) return

        const term = terminalRefs.current.get(activeId)
        if (!term) return

        // 优先使用选中的文本
        const selectedText = term.getSelection()?.trim()

        let content: string
        if (selectedText) {
            content = selectedText
        } else {
            // 没有选中时，使用最近的输出缓冲区
            const buffer = outputBuffers.current.get(activeId) || []
            const rawOutput = buffer.join('')
            content = rawOutput.replace(/\u001b\[[0-9;]*m/g, '').slice(-2000).trim()
        }

        if (!content) return

        setChatMode('chat')
        setInputPrompt(`I'm getting this error in the terminal. Please analyze it and fix the code:\n\n\`\`\`\n${content}\n\`\`\``)
    }

    const runScript = async (scriptName: string) => {
        setShowScriptMenu(false)

        // Ensure terminal is visible
        if (!terminalVisible) {
            setTerminalVisible(true)
        }

        // Use active terminal or create new one
        let targetId = activeId
        if (!targetId && terminals.length === 0) {
            await createTerminal()
            await new Promise(r => setTimeout(r, 500))
        }

        const lastId = Array.from(terminalRefs.current.keys()).pop()
        if (lastId) {
            const term = terminalRefs.current.get(lastId)
            if (term) {
                term.focus()
                window.electronAPI.writeTerminal(lastId, `npm run ${scriptName}\r`)
            }
        }
    }

    if (!terminalVisible) return null

    return (
        <>
            <style>{XTERM_STYLE}</style>
            <div
                className="
            bg-background-secondary border-t border-border-subtle flex flex-col transition-none relative z-10
        "
                style={{ height: isCollapsed ? 36 : height }}
            >
                {/* Resize Handle */}
                <div
                    className="absolute top-0 left-0 right-0 h-1 cursor-row-resize z-50 hover:bg-accent/50 transition-colors"
                    onMouseDown={startResizing}
                />

                {/* Header */}
                <div className="h-9 min-h-[36px] flex items-center justify-between border-b border-border-subtle bg-background-secondary select-none">
                    {/* Tabs Section */}
                    <div className="flex items-center flex-1 min-w-0 overflow-hidden h-full">
                        {/* Toggle Icon (Fixed) */}
                        <div
                            className="flex-shrink-0 flex items-center justify-center px-3 cursor-pointer hover:text-text-primary text-text-muted transition-colors border-r border-border-subtle h-full"
                            onClick={() => setIsCollapsed(!isCollapsed)}
                        >
                            <TerminalIcon className="w-3.5 h-3.5" />
                        </div>

                        {/* Scrollable Tabs List */}
                        <div className="flex items-center overflow-x-auto no-scrollbar flex-1 h-full">
                            {terminals.map(term => (
                                <div
                                    key={term.id}
                                    onClick={() => setActiveId(term.id)}
                                    className={`
                            flex items-center gap-2 px-3 h-full text-xs cursor-pointer border-r border-border-subtle/50 min-w-[120px] max-w-[200px] flex-shrink-0 group
                            ${activeId === term.id ? 'bg-surface text-text-primary border-t-2 border-t-accent' : 'text-text-muted hover:bg-surface-active border-t-2 border-t-transparent'}
                        `}
                                >
                                    <span className="truncate flex-1">{term.name}</span>
                                    <button
                                        onClick={(e) => closeTerminal(term.id, e)}
                                        className="p-0.5 rounded hover:bg-surface-hover hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Add Button (Fixed) */}
                        <div className="relative flex-shrink-0 h-full flex items-center px-1 border-l border-border-subtle">
                            <button
                                onClick={() => setShowShellMenu(!showShellMenu)}
                                className="p-1.5 rounded hover:bg-surface-active text-text-muted hover:text-text-primary"
                            >
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 px-2 flex-shrink-0">
                        {/* Run Task Menu */}
                        <div className="relative">
                            <button
                                onClick={() => setShowScriptMenu(!showScriptMenu)}
                                className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-surface-active text-text-muted hover:text-accent transition-colors mr-2"
                                title="Run Task"
                            >
                                <Play className="w-3.5 h-3.5" />
                                <span className="text-xs font-medium">Run</span>
                            </button>

                            {showScriptMenu && (
                                <>
                                    <div
                                        className="fixed inset-0 z-[99]"
                                        onClick={() => setShowScriptMenu(false)}
                                    />
                                    <div
                                        className="absolute top-full right-0 mt-1 bg-surface border border-border-subtle rounded-lg shadow-xl py-1 flex flex-col max-h-64 overflow-y-auto z-[100] min-w-[160px]"
                                        style={{ right: '100px' }}
                                    >
                                        {Object.keys(scripts).length > 0 ? Object.entries(scripts).map(([name, cmd]) => (
                                            <button
                                                key={name}
                                                onClick={() => runScript(name)}
                                                className="text-left px-3 py-2 text-xs text-text-primary hover:bg-surface-hover flex flex-col gap-0.5 border-b border-border-subtle/50 last:border-0"
                                            >
                                                <span className="font-medium">{name}</span>
                                                <span className="text-[10px] text-text-muted truncate max-w-[200px] opacity-70">{cmd}</span>
                                            </button>
                                        )) : (
                                            <div className="px-3 py-2 text-xs text-text-muted italic">No scripts found</div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        <button
                            onClick={handleFixWithAI}
                            className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-surface-active text-text-muted hover:text-accent transition-colors mr-2"
                            title="Fix with AI"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span className="text-xs font-medium">Fix</span>
                        </button>

                        <button
                            onClick={() => {
                                createTerminal()
                                setIsSplitView(true)
                            }}
                            className="p-2 hover:bg-surface-active rounded transition-colors text-text-muted"
                            title="Split Terminal"
                        >
                            <SplitSquareHorizontal className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => setIsSplitView(!isSplitView)}
                            className={`p-2 hover:bg-surface-active rounded transition-colors ${isSplitView ? 'text-accent' : 'text-text-muted'}`}
                            title="Toggle Split View"
                        >
                            <LayoutTemplate className="w-3.5 h-3.5" />
                        </button>

                        <button onClick={() => activeId && terminalRefs.current.get(activeId)?.clear()} className="p-2 hover:bg-surface-active rounded transition-colors text-text-muted" title="Clear">
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-2 hover:bg-surface-active rounded transition-colors text-text-muted">
                            {isCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => setTerminalVisible(false)} className="p-2 hover:bg-surface-active rounded transition-colors text-text-muted" title="Close">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Terminals Container */}
                <div className={`flex-1 p-0 min-h-0 relative bg-surface ${isCollapsed ? 'hidden' : 'block'}`}>
                    <div className={`h-full w-full ${isSplitView ? 'grid grid-cols-2 gap-1' : ''}`}>
                        {terminals.map(term => (
                            <div
                                key={term.id}
                                ref={el => { if (el) containerRefs.current.set(term.id, el) }}
                                className={`h-full w-full pl-2 pt-1 relative group/term
                                    ${isSplitView ? 'border border-border-subtle' : (activeId === term.id ? 'block' : 'hidden')}
                                    ${isSplitView && activeId === term.id ? 'ring-1 ring-accent' : ''}
                                `}
                                onClick={() => setActiveId(term.id)}
                            >
                                {isSplitView && (
                                    <div className="absolute top-0 right-0 p-1 z-10 opacity-0 group-hover/term:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => closeTerminal(term.id, e)}
                                            className="p-1 rounded bg-background/80 hover:bg-red-500 hover:text-white text-text-muted"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Shell Menu - Outside main container to avoid overflow clipping */}
            {showShellMenu && (
                <>
                    <div
                        className="fixed inset-0 z-[99]"
                        onClick={() => setShowShellMenu(false)}
                    />
                    <div
                        className="fixed bg-surface border border-border-subtle rounded-lg shadow-xl py-1 flex flex-col max-h-64 overflow-y-auto z-[100]"
                        style={{
                            bottom: `${height + 8}px`,
                            right: '466px',
                            width: '192px',
                        }}
                    >
                        {availableShells.length > 0 ? availableShells.map(shell => (
                            <button
                                key={shell.label}
                                onClick={() => createTerminal(shell.path, shell.label)}
                                className="text-left px-3 py-2 text-xs text-text-primary hover:bg-surface-hover"
                            >
                                {shell.label}
                            </button>
                        )) : (
                            <div className="px-3 py-2 text-xs text-text-muted italic">No shells found</div>
                        )}
                    </div>
                </>
            )}
        </>
    )
}