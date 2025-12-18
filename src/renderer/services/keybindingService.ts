
export interface Command {
    id: string
    title: string
    category?: string
    defaultKey?: string
}

export interface Keybinding {
    commandId: string
    key: string
}

class KeybindingService {
    private commands: Map<string, Command> = new Map()
    private overrides: Map<string, string> = new Map()
    private initialized = false

    async init() {
        if (this.initialized) return
        await this.loadOverrides()
        this.initialized = true
    }

    registerCommand(command: Command) {
        this.commands.set(command.id, command)
    }

    getBinding(commandId: string): string | undefined {
        return this.overrides.get(commandId) || this.commands.get(commandId)?.defaultKey
    }

    getAllCommands(): Command[] {
        return Array.from(this.commands.values())
    }

    isOverridden(commandId: string): boolean {
        return this.overrides.has(commandId)
    }

    matches(e: React.KeyboardEvent | KeyboardEvent, commandId: string): boolean {
        const binding = this.getBinding(commandId)
        if (!binding) return false

        const parts = binding.toLowerCase().split('+')
        const key = parts.pop()

        const meta = parts.includes('meta') || parts.includes('cmd') || parts.includes('command')
        const ctrl = parts.includes('ctrl') || parts.includes('control')
        const shift = parts.includes('shift')
        const alt = parts.includes('alt') || parts.includes('option')

        if (e.metaKey !== meta) return false
        if (e.ctrlKey !== ctrl) return false
        if (e.shiftKey !== shift) return false
        if (e.altKey !== alt) return false

        // Handle special keys
        if (key === 'space') return e.code === 'Space' || e.key === ' '

        return e.key.toLowerCase() === key
    }

    async updateBinding(commandId: string, newKey: string | null) {
        if (newKey === null) {
            this.overrides.delete(commandId)
        } else {
            this.overrides.set(commandId, newKey)
        }
        await this.saveOverrides()
    }

    async resetBinding(commandId: string) {
        this.overrides.delete(commandId)
        await this.saveOverrides()
    }

    private async loadOverrides() {
        try {
            const saved = await window.electronAPI.getSetting('keybindings') as Record<string, string>
            if (saved) {
                this.overrides = new Map(Object.entries(saved))
            }
        } catch (e) {
            console.error('Failed to load keybindings:', e)
        }
    }

    private async saveOverrides() {
        try {
            const obj = Object.fromEntries(this.overrides)
            await window.electronAPI.setSetting('keybindings', obj)
        } catch (e) {
            console.error('Failed to save keybindings:', e)
        }
    }
}

export const keybindingService = new KeybindingService()
