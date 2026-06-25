import { Link, useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import { useSession } from '@/lib/useSession'
import { supabase } from '@/lib/supabase'

const items = [
  { to: '/map', icon: 'map' },
  { to: '/explore', icon: 'explore' },
  { to: '/following', icon: 'group' },
  { to: '/saved', icon: 'bookmark' },
]

export function BottomNavBar() {
  const { pathname } = useLocation()
  const session = useSession()

  if (!session) {
    return (
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 bg-surface border-t border-outline-variant h-14 px-4 flex items-center">
        <button
          onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/explore` } })}
          className="w-full h-9 bg-primary text-on-primary font-label-caps text-label-caps uppercase tracking-wider hover:opacity-90 transition-opacity"
        >
          Sign In
        </button>
      </nav>
    )
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 bg-surface border-t border-outline-variant flex justify-around items-center h-14 px-2">
      {items.map(({ to, icon }) => {
        const active = pathname === to
        return (
          <Link
            key={to}
            to={to}
            className={`flex flex-col items-center justify-center w-full h-full transition-colors ${
              active ? 'text-primary border-t-2 border-primary -mt-[2px]' : 'text-secondary hover:text-on-surface'
            }`}
          >
            <Icon name={icon} className="text-[24px]" filled={active} />
          </Link>
        )
      })}
    </nav>
  )
}
