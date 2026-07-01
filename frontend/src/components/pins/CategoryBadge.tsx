import { Icon as LucideIcon } from 'lucide-react'
import { categoryStyle } from '@/lib/categories'

interface Props {
  category: string | null | undefined
  className?: string
}

// Category pill used in the pin drawers — category colour as tint + text,
// with the matching Lucide icon so it echoes the marker.
export function CategoryBadge({ category, className = '' }: Props) {
  if (!category) return null
  const { label, color, iconNode } = categoryStyle(category)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-label-caps text-label-caps ${className}`}
      style={{ backgroundColor: `${color}22`, color }}
    >
      <LucideIcon iconNode={iconNode} size={14} className="shrink-0" />
      {label}
    </span>
  )
}
