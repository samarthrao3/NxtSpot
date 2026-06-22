import { Link, useLocation } from 'react-router-dom'
import { Icon } from './Icon'

const items = [
  { to: '/map', label: 'Map', icon: 'map' },
  { to: '/explore', label: 'Discover', icon: 'explore' },
  { to: '/saved', label: 'Saved', icon: 'bookmark' },
]

export function SideNavBar({ children }: { children?: React.ReactNode }) {
  const { pathname } = useLocation()

  return (
    <aside className="hidden md:flex fixed left-0 top-12 h-[calc(100vh-48px)] w-[220px] bg-surface border-r border-outline-variant flex-col py-4 z-40">
      <div className="px-6 mb-8 flex items-center gap-3">
        <div className="w-10 h-10 bg-primary-container rounded flex items-center justify-center text-on-primary font-bold font-headline-sm">
          FM
        </div>
        <div>
          <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Food Map</h2>
          <p className="font-body-sm text-body-sm text-secondary">Curation First</p>
        </div>
      </div>

      <ul className="flex flex-col gap-2 w-full mb-4">
        {items.map(({ to, label, icon }) => {
          const active = pathname === to
          return (
            <li key={to}>
              <Link
                to={to}
                className={`flex items-center gap-3 px-6 py-3 font-body-base text-body-base transition-colors ${
                  active
                    ? 'text-primary font-bold border-r-2 border-primary bg-surface-container-low'
                    : 'text-secondary hover:bg-surface-container-low'
                }`}
              >
                <Icon name={icon} filled={active} />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>

      {children ? (
        <div className="flex-1 overflow-y-auto flex flex-col border-t border-outline-variant">{children}</div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="px-6 pt-4 mt-auto pb-4">
        <button className="w-full py-2 px-4 border border-outline text-on-surface font-label-caps text-label-caps uppercase tracking-wider hover:bg-surface-container transition-colors flex items-center justify-center gap-2">
          <Icon name="add" className="text-[16px]" />
          Add Pin
        </button>
      </div>
    </aside>
  )
}
