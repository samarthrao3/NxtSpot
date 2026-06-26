import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import { authApi } from '@/lib/api'
import { getAppToken } from '@/lib/auth'
import { Icon } from './Icon'

const navItems = [
  { to: '/map', label: 'Map' },
  { to: '/explore', label: 'Discover' },
  { to: '/following', label: 'Following' },
  { to: '/saved', label: 'Saved' },
]

export function TopNavBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const session = useSession()
  const user = session?.user
  const { data: profile } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const token = await getAppToken()
      return authApi.me(token)
    },
    enabled: !!session,
    staleTime: 60_000,
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleGoogleLogin = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/map` },
    })

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  return (
    <header className="fixed top-0 left-0 w-full z-50 flex items-center px-margin-mobile md:px-margin-desktop bg-surface border-b border-outline-variant h-12">
      <Link to="/explore" className="font-headline-sm text-headline-sm font-bold text-on-surface shrink-0">
        NxtSpot
      </Link>

      {user && (
        <nav className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center gap-2 h-12">
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
      )}

      <div className="ml-auto flex items-center gap-3 md:gap-4 shrink-0">
        {user ? (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-3 md:gap-4"
            >
              <span className="hidden sm:inline font-body-base text-body-base text-on-surface">
                {profile?.name ?? user.email}
              </span>
              <div className="w-8 h-8 rounded-full bg-surface-container overflow-hidden border border-outline-variant shrink-0">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="User profile"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : null}
              </div>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-surface border border-outline-variant shadow-md z-50 flex flex-col">
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    navigate('/settings')
                  }}
                  className="flex items-center gap-3 px-4 py-3 font-body-base text-body-base text-on-surface hover:bg-surface-container-low transition-colors text-left"
                >
                  <Icon name="settings" className="text-[18px]" />
                  Settings
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    supabase.auth.signOut()
                  }}
                  className="flex items-center gap-3 px-4 py-3 font-body-base text-body-base text-on-surface border-t border-outline-variant hover:bg-surface-container-low transition-colors text-left"
                >
                  <Icon name="logout" className="text-[18px]" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : session === null ? (
          <button
            onClick={handleGoogleLogin}
            className="hidden md:block font-label-caps text-label-caps uppercase tracking-wider px-4 py-2 bg-[#1a1a1a] text-white hover:bg-primary transition-colors border border-[#1a1a1a]"
          >
            Sign In
          </button>
        ) : null}
      </div>
    </header>
  )
}
