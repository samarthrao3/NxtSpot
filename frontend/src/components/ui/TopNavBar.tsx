import { Link, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'

const navItems = [
  { to: '/map', label: 'Map' },
  { to: '/explore', label: 'Discover' },
  { to: '/saved', label: 'Saved' },
]

export function TopNavBar() {
  const { pathname } = useLocation()
  const session = useSession()
  const user = session?.user

  const handleGoogleLogin = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/map` },
    })

  return (
    <header className="fixed top-0 left-0 w-full z-50 flex items-center justify-between px-margin-mobile md:px-margin-desktop bg-surface border-b border-outline-variant h-12">
      <Link to="/explore" className="font-headline-sm text-headline-sm font-bold text-on-surface shrink-0">
        Bangalore Food Map
      </Link>

      <nav className="hidden md:flex items-center gap-2 h-full">
        {navItems.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            className={`h-full flex items-center px-3 font-body-base text-body-base transition-colors ${
              pathname === to
                ? 'text-primary border-b-2 border-primary font-bold'
                : 'text-secondary hover:bg-surface-container'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-3 md:gap-4">
        {user ? (
          <>
            <span className="hidden sm:inline font-body-base text-body-base text-on-surface">
              {(user.user_metadata.full_name as string) ?? user.email}
            </span>
            <div className="w-8 h-8 rounded-full bg-surface-container overflow-hidden border border-outline-variant shrink-0">
              {user.user_metadata.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url as string}
                  alt="User profile"
                  className="w-full h-full object-cover"
                />
              ) : null}
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              className="font-body-base text-body-base text-secondary hover:text-primary transition-colors"
            >
              Sign out
            </button>
          </>
        ) : session === null ? (
          <button
            onClick={handleGoogleLogin}
            className="font-label-caps text-label-caps uppercase tracking-wider px-4 py-2 bg-[#1a1a1a] text-white hover:bg-primary transition-colors border border-[#1a1a1a]"
          >
            Sign In
          </button>
        ) : null}
      </div>
    </header>
  )
}
