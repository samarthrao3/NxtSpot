import { Link, useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import { useSession } from '@/lib/useSession'
import { supabase } from '@/lib/supabase'

const items = [
  { to: '/map', icon: 'map', label: 'Map' },
  { to: '/explore', icon: 'explore', label: 'Discover' },
  { to: '/following', icon: 'group', label: 'Following' },
  { to: '/saved', icon: 'bookmark', label: 'Saved' },
]

export function BottomNavBar() {
  const { pathname } = useLocation()
  const session = useSession()

  if (!session) {
    return (
      <nav className="md:hidden fixed bottom-4 left-4 right-4 z-50 rounded-full bg-surface-container shadow-[0_4px_24px_rgba(0,0,0,0.6)] h-14 px-5 flex items-center">
        <button
          onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/explore` } })}
          className="w-full h-9 rounded-full bg-primary text-on-primary font-label-caps text-label-caps uppercase tracking-wider hover:opacity-90 transition-opacity"
        >
          Sign In
        </button>
      </nav>
    )
  }

  return (
    <nav className="md:hidden fixed bottom-4 left-4 right-4 z-50 rounded-full bg-surface-container shadow-[0_4px_24px_rgba(0,0,0,0.6)] flex justify-around items-center h-14 px-3">
      {items.map(({ to, icon, label }) => {
        const active = pathname === to
        return (
          <Link
            key={to}
            to={to}
            className="flex flex-col items-center justify-center flex-1 h-full transition-colors"
          >
            <Icon
              name={icon}
              filled={active}
              className={`text-[22px] transition-colors ${active ? 'text-primary' : 'text-secondary'}`}
            />
            <span className={`font-label-caps text-[9px] leading-none uppercase tracking-wide mt-0.5 transition-colors ${active ? 'text-primary' : 'text-secondary'}`}>
              {label}
            </span>
            {active && <span className="mt-1 h-0.5 w-4 rounded-full bg-primary" />}
          </Link>
        )
      })}
    </nav>
  )
}
