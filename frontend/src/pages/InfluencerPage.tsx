import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import mapboxgl from 'mapbox-gl'
import { MAPBOX_TOKEN, BANGALORE_CENTER, BANGALORE_DEFAULT_ZOOM, MAP_STYLE } from '@/lib/mapbox'
import { influencersApi, pinsApi, savedPinsApi, type Pin } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { getAppToken } from '@/lib/auth'
import { useSession } from '@/lib/useSession'
import { Icon } from '@/components/ui/Icon'
import { TopNavBar } from '@/components/ui/TopNavBar'
import { BottomNavBar } from '@/components/ui/BottomNavBar'
import { Spinner } from '@/components/ui/Spinner'

mapboxgl.accessToken = MAPBOX_TOKEN

export function InfluencerPage() {
  const { handle } = useParams<{ handle: string }>()
  const session = useSession()
  const qc = useQueryClient()
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markers = useRef<mapboxgl.Marker[]>([])
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null)

  const { data: influencer, isLoading: loadingProfile } = useQuery({
    queryKey: ['influencer', handle],
    queryFn: () => influencersApi.getByHandle(handle!),
    enabled: !!handle,
    staleTime: 5 * 60 * 1000,
  })

  const { data: pins, isLoading: loadingPins } = useQuery({
    queryKey: ['pins', 'influencer', influencer?.id],
    queryFn: () => pinsApi.getByInfluencer(influencer!.id),
    enabled: !!influencer?.id,
    staleTime: 5 * 60 * 1000,
  })

  const { data: savedPins } = useQuery({
    queryKey: ['saved-pins'],
    queryFn: async () => {
      const token = await getAppToken()
      return savedPinsApi.getAll(token)
    },
    enabled: !!session,
  })
  const savedIds = new Set(savedPins?.map((p) => p.id))

  const save = useMutation({
    mutationFn: async (pinId: string) => {
      const token = await getAppToken()
      return savedPinsApi.save(pinId, token)
    },
    onMutate: async (pinId) => {
      await qc.cancelQueries({ queryKey: ['saved-pins'] })
      const previous = qc.getQueryData<Pin[]>(['saved-pins'])
      const pin = pins?.find((p) => p.id === pinId)
      if (pin) qc.setQueryData<Pin[]>(['saved-pins'], (old) => [...(old ?? []), pin])
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous !== undefined) qc.setQueryData(['saved-pins'], context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['saved-pins'] }),
  })
  const unsave = useMutation({
    mutationFn: async (pinId: string) => {
      const token = await getAppToken()
      return savedPinsApi.unsave(pinId, token)
    },
    onMutate: async (pinId) => {
      await qc.cancelQueries({ queryKey: ['saved-pins'] })
      const previous = qc.getQueryData<Pin[]>(['saved-pins'])
      qc.setQueryData<Pin[]>(['saved-pins'], (old) => (old ?? []).filter((p) => p.id !== pinId))
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous !== undefined) qc.setQueryData(['saved-pins'], context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['saved-pins'] }),
  })

  const handleSaveToggle = (pinId: string) => {
    if (!session) {
      supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href },
      })
      return
    }
    if (savedIds.has(pinId)) unsave.mutate(pinId)
    else save.mutate(pinId)
  }

  // Initialise map
  useEffect(() => {
    if (map.current || !mapContainer.current) return
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: BANGALORE_CENTER,
      zoom: BANGALORE_DEFAULT_ZOOM,
      antialias: false,
      dragRotate: false,
      touchPitch: false,
      fadeDuration: 0,
    })
    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [loadingProfile])

  // Drop markers when pins load
  useEffect(() => {
    if (!map.current || !pins) return
    markers.current.forEach((m) => m.remove())
    markers.current = []
    const AMBER = '#ffc174'
    const SURFACE = '#1c1b1b'
    pins.forEach((pin) => {
      const ns = 'http://www.w3.org/2000/svg'
      const svg = document.createElementNS(ns, 'svg')
      svg.setAttribute('width', '26')
      svg.setAttribute('height', '34')
      svg.setAttribute('viewBox', '0 0 26 34')
      svg.style.cssText = 'display:block;filter:drop-shadow(0 2px 10px rgba(255,193,116,0.45));cursor:pointer;'
      const path = document.createElementNS(ns, 'path')
      path.setAttribute('d', 'M13,2 C7.48,2 3,6.48 3,12 C3,20.5 13,34 13,34 C13,34 23,20.5 23,12 C23,6.48 18.52,2 13,2 Z')
      path.setAttribute('fill', SURFACE)
      path.setAttribute('stroke', AMBER)
      path.setAttribute('stroke-width', '2.5')
      svg.appendChild(path)
      if (pin.rating != null) {
        const t = document.createElementNS(ns, 'text')
        t.setAttribute('x', '13')
        t.setAttribute('y', '12')
        t.setAttribute('text-anchor', 'middle')
        t.setAttribute('dominant-baseline', 'central')
        t.setAttribute('font-family', 'system-ui,sans-serif')
        t.setAttribute('font-size', '8')
        t.setAttribute('font-weight', '700')
        t.setAttribute('fill', AMBER)
        t.setAttribute('pointer-events', 'none')
        t.textContent = pin.rating % 1 === 0 ? String(pin.rating) : pin.rating.toFixed(1)
        svg.appendChild(t)
      } else {
        const dot = document.createElementNS(ns, 'circle')
        dot.setAttribute('cx', '13')
        dot.setAttribute('cy', '12')
        dot.setAttribute('r', '4')
        dot.setAttribute('fill', AMBER)
        dot.setAttribute('fill-opacity', '0.8')
        dot.setAttribute('pointer-events', 'none')
        svg.appendChild(dot)
      }
      const el = document.createElement('div')
      el.appendChild(svg)
      el.addEventListener('click', () => setSelectedPin(pin))
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat([pin.lng, pin.lat]).addTo(map.current!)
      markers.current.push(marker)
    })
  }, [pins])

  if (loadingProfile) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Spinner />
      </div>
    )
  }

  if (!influencer) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background gap-3">
        <p className="font-body-base text-body-base text-secondary">Influencer not found</p>
        <a href="/explore" className="text-primary hover:underline font-body-base text-body-base">
          ← Back to explore
        </a>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <TopNavBar />
      <main className="flex-grow relative w-full mt-12">
        <div ref={mapContainer} className="absolute inset-0" />

        {/* Influencer header strip */}
        <div className="absolute top-4 left-4 z-30 bg-surface border border-outline-variant flex items-center p-2">
          {influencer.avatar_url ? (
            <img
              src={influencer.avatar_url}
              alt={influencer.name}
              referrerPolicy="no-referrer"
              className="w-10 h-10 object-cover border border-outline-variant mr-3"
            />
          ) : (
            <div className="w-10 h-10 flex items-center justify-center border border-outline-variant mr-3 bg-surface-container text-on-surface-variant font-headline-sm text-headline-sm">
              {influencer.name[0]}
            </div>
          )}
          <div>
            <h1 className="font-headline-sm text-headline-sm text-on-surface m-0 leading-tight">
              @{influencer.handle}
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant m-0">
              {influencer.pin_count} Curated Pins
            </p>
          </div>
          <button
            onClick={() => navigator.share?.({ url: window.location.href, title: influencer.name })}
            className="ml-4 p-2 text-on-surface hover:bg-surface-container border-l border-outline-variant h-full flex items-center justify-center"
          >
            <Icon name="share" />
          </button>
        </div>

        {loadingPins && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-surface border border-outline-variant px-4 py-2 flex items-center gap-2 font-body-base text-body-base text-secondary">
            <Spinner size={4} />
            Loading pins…
          </div>
        )}

        {/* Pin detail drawer */}
        {selectedPin && (
          <aside className="absolute top-0 right-0 h-full w-full md:w-[400px] bg-surface border-l border-outline-variant z-40 flex flex-col overflow-y-auto">
            <div className="sticky top-0 bg-surface z-10 flex justify-between items-center p-4 border-b border-outline-variant">
              <button
                onClick={() => setSelectedPin(null)}
                className="text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <Icon name="close" />
              </button>
              <button
                onClick={() => handleSaveToggle(selectedPin.id)}
                className={`transition-colors ${
                  savedIds.has(selectedPin.id) ? 'text-primary' : 'text-on-surface-variant hover:text-primary'
                }`}
              >
                <Icon name="bookmark" filled={savedIds.has(selectedPin.id)} />
              </button>
            </div>

            <div className="p-4 pb-20 md:pb-4 flex flex-col flex-1">
              <div className="w-full aspect-[4/3] border border-outline-variant mb-6 relative overflow-hidden bg-surface-container">
                {selectedPin.photos[0] ? (
                  <img
                    src={selectedPin.photos[0]}
                    alt={selectedPin.restaurant_name}
                    className="w-full h-full object-cover"
                  />
                ) : null}
                {selectedPin.rating && (
                  <div className="absolute bottom-3 right-3 bg-surface border border-outline-variant px-2 py-1 flex items-center gap-1">
                    <Icon name="star" filled className="text-[14px] text-primary" />
                    <span className="font-label-caps text-label-caps text-on-surface">{selectedPin.rating}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col flex-grow">
                <div className="mb-2 flex flex-wrap gap-2">
                  {selectedPin.vibe_tag && (
                    <span className="border border-outline-variant px-2 py-1 font-label-caps text-label-caps text-on-surface-variant bg-surface-container-low">
                      {selectedPin.vibe_tag.toUpperCase()}
                    </span>
                  )}
                  {selectedPin.price_range && (
                    <span className="border border-outline-variant px-2 py-1 font-label-caps text-label-caps text-on-surface-variant bg-surface-container-low">
                      {selectedPin.price_range}
                    </span>
                  )}
                </div>
                <h2 className="font-headline-md text-headline-md text-on-surface mt-2 mb-1">
                  {selectedPin.restaurant_name}
                </h2>

                {selectedPin.must_order && (
                  <div className="border-t border-outline-variant pt-6 mb-6 mt-4">
                    <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-2">MUST ORDER</h3>
                    <p className="font-headline-sm text-headline-sm text-primary mb-2">{selectedPin.must_order}</p>
                    {selectedPin.note && (
                      <p className="font-body-base text-body-base text-on-surface leading-relaxed">
                        "{selectedPin.note}"
                      </p>
                    )}
                  </div>
                )}
                {!selectedPin.must_order && selectedPin.note && (
                  <p className="font-body-base text-body-base text-on-surface leading-relaxed mt-4 border-t border-outline-variant pt-6">
                    "{selectedPin.note}"
                  </p>
                )}

                <div className="mt-auto pt-6 border-t border-outline-variant">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${selectedPin.lat},${selectedPin.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3 bg-primary text-on-primary font-label-caps text-label-caps tracking-wider hover:bg-primary-container transition-colors border border-primary flex items-center justify-center gap-2"
                  >
                    <Icon name="directions" className="text-[18px]" />
                    GET DIRECTIONS
                  </a>
                </div>
              </div>
            </div>
          </aside>
        )}
      </main>
      <BottomNavBar />
    </div>
  )
}
