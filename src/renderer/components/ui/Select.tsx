import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

export interface SelectOption {
    value: string
    label: string
    icon?: React.ReactNode
}

interface SelectProps {
    options: SelectOption[]
    value: string
    onChange: (value: string) => void
    placeholder?: string
    className?: string
    disabled?: boolean
    dropdownPosition?: 'top' | 'bottom' | 'auto'
}

export function Select({
    options,
    value,
    onChange,
    placeholder = 'Select...',
    className = '',
    disabled = false,
    dropdownPosition = 'auto'
}: SelectProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
    const containerRef = useRef<HTMLDivElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const selectedOption = options.find(opt => opt.value === value)

    // 计算下拉菜单位置
    useEffect(() => {
        if (isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            const spaceBelow = window.innerHeight - rect.bottom
            const spaceAbove = rect.top
            const shouldShowAbove = dropdownPosition === 'top' || 
                (dropdownPosition === 'auto' && spaceBelow < 250 && spaceAbove > spaceBelow)
            
            setDropdownStyle({
                position: 'fixed',
                left: rect.left,
                width: rect.width,
                ...(shouldShowAbove 
                    ? { bottom: window.innerHeight - rect.top + 4 }
                    : { top: rect.bottom + 4 }
                ),
            })
        }
    }, [isOpen, dropdownPosition])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node) &&
                dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }

        const handleScroll = (event: Event) => {
            // 如果滚动发生在下拉菜单内部，不关闭
            if (dropdownRef.current?.contains(event.target as Node)) {
                return
            }
            if (isOpen) setIsOpen(false)
        }

        document.addEventListener('mousedown', handleClickOutside)
        window.addEventListener('scroll', handleScroll, true)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
            window.removeEventListener('scroll', handleScroll, true)
        }
    }, [isOpen])

    const handleSelect = (optionValue: string) => {
        onChange(optionValue)
        setIsOpen(false)
    }

    const dropdown = isOpen && (
        <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="z-[9999] py-1 bg-surface border border-border-subtle rounded-md shadow-xl animate-fade-in max-h-60 overflow-auto custom-scrollbar"
        >
            {options.map((option) => (
                <button
                    key={option.value}
                    onClick={() => handleSelect(option.value)}
                    className={`
                        w-full flex items-center justify-between px-3 py-1.5 text-sm text-left
                        hover:bg-surface-hover transition-colors
                        ${option.value === value ? 'text-accent bg-accent/5' : 'text-text-secondary'}
                    `}
                >
                    <div className="flex items-center gap-2 truncate">
                        {option.icon && <span className="flex-shrink-0 w-4 h-4">{option.icon}</span>}
                        <span>{option.label}</span>
                    </div>
                    {option.value === value && <Check className="w-3.5 h-3.5" />}
                </button>
            ))}
            {options.length === 0 && (
                <div className="px-3 py-2 text-xs text-text-muted text-center">No options</div>
            )}
        </div>
    )

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`
                    w-full flex items-center justify-between px-3 py-1.5 text-sm 
                    bg-surface-active/50 border border-white/10 rounded-md 
                    hover:bg-surface-hover hover:border-white/20 transition-all
                    focus:outline-none focus:ring-2 focus:ring-accent/50
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
            >
                <div className="flex items-center gap-2 truncate">
                    {selectedOption?.icon && <span className="flex-shrink-0">{selectedOption.icon}</span>}
                    <span className={selectedOption ? 'text-text-primary' : 'text-text-muted'}>
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                </div>
                <ChevronDown className={`w-4 h-4 text-text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {createPortal(dropdown, document.body)}
        </div>
    )
}
