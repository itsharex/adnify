// 从 assets 目录导入图标，Vite 会正确处理路径并生成正确的 hash 文件名
import iconPng from '@renderer/assets/icon.png'

export function Logo({ className = "w-6 h-6", glow = false }: { className?: string; glow?: boolean }) {
  return (
    <img
      src={iconPng}
      alt="Adnify"
      className={`${className} ${glow ? 'drop-shadow-[0_0_8px_rgba(var(--accent),0.6)]' : ''}`}
    />
  )
}
