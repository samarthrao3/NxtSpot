import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  ChevronDown,
  Compass,
  ExternalLink,
  ImagePlus,
  LogOut,
  Map,
  Menu,
  Moon,
  Navigation,
  Pencil,
  Plus,
  Search,
  Settings,
  Share2,
  Star,
  Sun,
  Trash2,
  Users,
  X,
} from 'lucide-react'

const icons: Record<string, LucideIcon> = {
  add: Plus,
  add_photo_alternate: ImagePlus,
  arrow_back: ArrowLeft,
  arrow_forward: ArrowRight,
  bookmark: Bookmark,
  close: X,
  dark_mode: Moon,
  delete: Trash2,
  directions: Navigation,
  edit: Pencil,
  expand_more: ChevronDown,
  explore: Compass,
  group: Users,
  light_mode: Sun,
  logout: LogOut,
  map: Map,
  menu: Menu,
  open_in_new: ExternalLink,
  search: Search,
  settings: Settings,
  share: Share2,
  star: Star,
}

interface Props {
  name: string
  className?: string
  filled?: boolean
}

export function Icon({ name, className = '', filled = false }: Props) {
  const LucideComponent = icons[name]
  if (!LucideComponent) return null

  const sizeMatch = className.match(/text-\[(\d+)px\]/)
  const size = sizeMatch ? parseInt(sizeMatch[1]) : 20
  const restClass = className.replace(/text-\[\d+px\]/, '').trim()

  return (
    <LucideComponent
      size={size}
      className={restClass}
      fill={filled ? 'currentColor' : 'none'}
    />
  )
}
