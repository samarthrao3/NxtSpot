import { useState } from 'react'
import { Icon } from './Icon'

interface Props {
  children?: React.ReactNode
  onAddPin?: () => void
  pinOpen?: boolean
}

export function SideNavBar({ children, onAddPin, pinOpen }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`fixed left-4 top-[60px] z-50 w-10 h-10 items-center justify-center bg-surface border border-outline-variant shadow-md hover:bg-surface-container-low transition-colors ${pinOpen ? 'hidden md:flex' : 'flex'}`}
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        <Icon name={open ? 'close' : 'menu'} />
      </button>

      {open && (
        <div
          className="block fixed inset-0 top-12 bg-black/20 z-30"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`flex fixed left-0 top-12 h-[calc(100vh-48px-72px)] md:h-[calc(100vh-48px)] w-[280px] max-w-[85vw] bg-surface border-r border-outline-variant flex-col pt-16 pb-4 z-40 transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {children ? (
          <div className="flex-1 overflow-y-auto flex flex-col">{children}</div>
        ) : (
          <div className="flex-1" />
        )}

        {onAddPin && (
          <div className="px-6 pt-4 mt-auto pb-4">
            <button
              onClick={() => { onAddPin(); setOpen(false) }}
              className="w-full py-2 px-4 border border-outline text-on-surface font-label-caps text-label-caps uppercase tracking-wider hover:bg-surface-container transition-colors flex items-center justify-center gap-2"
            >
              <Icon name="add" className="text-[16px]" />
              Add Pin
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
