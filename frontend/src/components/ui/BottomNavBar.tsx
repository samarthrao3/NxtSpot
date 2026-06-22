import { Link, useLocation } from 'react-router-dom'
import { Icon } from './Icon'

const items = [
  { to: '/map', icon: 'map' },
  { to: '/explore', icon: 'explore' },
  { to: '/saved', icon: 'bookmark' },
]

export function BottomNavBar() {
  const { pathname } = useLocation()

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
