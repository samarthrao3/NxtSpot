import { useEffect, useRef, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallBanner() {
  const [show, setShow] = useState(false)
  const [platform, setPlatform] = useState<'android' | 'ios' | null>(null)
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true

    if (isStandalone || localStorage.getItem('pwa-banner-dismissed')) return

    const isIOS =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      promptRef.current = e as BeforeInstallPromptEvent
      setTimeout(() => { setPlatform('android'); setShow(true) }, 2500)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    if (isIOS) {
      setTimeout(() => { setPlatform('ios'); setShow(true) }, 2500)
    }

    const handleInstalled = () => setShow(false)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const dismiss = () => {
    setShow(false)
    localStorage.setItem('pwa-banner-dismissed', '1')
  }

  const install = async () => {
    if (!promptRef.current) return
    await promptRef.current.prompt()
    const { outcome } = await promptRef.current.userChoice
    if (outcome === 'accepted') setShow(false)
    promptRef.current = null
  }

  if (!show || !platform) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[200] animate-slide-in-up pointer-events-none">
      <div
        className="pointer-events-auto mx-3 mb-3 rounded-2xl bg-surface-container-low border border-outline-variant shadow-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            <img
              src="/pwa-192x192.png"
              alt="NxtSpot"
              className="w-12 h-12 rounded-xl shrink-0 border border-outline-variant"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <p className="font-headline-sm text-headline-sm text-on-surface leading-tight">
                    NxtSpot
                  </p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                    Add to your home screen
                  </p>
                </div>
                <button
                  onClick={dismiss}
                  className="text-on-surface-variant hover:text-on-surface shrink-0 p-1 -mr-1 -mt-1"
                  aria-label="Dismiss"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                </button>
              </div>

              {platform === 'android' && (
                <button
                  onClick={install}
                  className="mt-2 w-full py-2.5 rounded-xl bg-primary text-on-primary font-label-caps text-label-caps tracking-wider hover:bg-primary-container transition-colors"
                >
                  ADD TO HOME SCREEN
                </button>
              )}

              {platform === 'ios' && (
                <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                  Tap{' '}
                  <span className="inline-flex items-center gap-1 text-primary">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6a2 2 0 01-2-2V10a2 2 0 012-2h3v2H6v11h12V10h-3V8h3a2 2 0 012 2z"/>
                    </svg>
                    Share
                  </span>{' '}
                  then tap{' '}
                  <span className="text-primary font-medium">"Add to Home Screen"</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
