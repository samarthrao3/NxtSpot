import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import mapboxgl from 'mapbox-gl'
import { SearchBox } from '@mapbox/search-js-react'
import { MAPBOX_TOKEN, BANGALORE_BBOX, BANGALORE_CENTER, BANGALORE_DEFAULT_ZOOM, MAP_STYLE } from '@/lib/mapbox'
import { feedApi, influencersApi, subscriptionsApi } from '@/lib/api'
import { getAppToken } from '@/lib/auth'
import { useCurrentUser } from '@/lib/useCurrentUser'
import { colorForId } from '@/lib/colors'
import { TopNavBar } from '@/components/ui/TopNavBar'
import { SideNavBar } from '@/components/ui/SideNavBar'
import { BottomNavBar } from '@/components/ui/BottomNavBar'
import { Spinner } from '@/components/ui/Spinner'
import { PinFormModal } from '@/components/pins/PinFormModal'

mapboxgl.accessToken = MAPBOX_TOKEN

export function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markers = useRef<mapboxgl.Marker[]>([])
  const [mapReady, setMapReady] = useState(false)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [addPinMode, setAddPinMode] = useState(false)
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const { data: currentUser } = useCurrentUser()

  const { data: feedGroups, isLoading } = useQuery({
    queryKey: ['feed'],
    queryFn: async () => {
      const token = await getAppToken()
      return feedApi.get(token)
    },
  })
  const pins = useMemo(() => feedGroups?.flatMap((group) => group.pins), [feedGroups])

  const { data: following } = useQuery({
    queryKey: ['following'],
    queryFn: async () => {
      const token = await getAppToken()
      return subscriptionsApi.getFollowing(token)
    },
  })

  const { data: allInfluencers } = useQuery({
    queryKey: ['influencers'],
    queryFn: influencersApi.getAll,
  })

  const followingIds = new Set(following?.map((f) => f.influencer_id))
  const followedInfluencers = allInfluencers?.filter((inf) => followingIds.has(inf.id)) ?? []

  // Initialise map
  useEffect(() => {
    if (map.current || !mapContainer.current) return
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: BANGALORE_CENTER,
      zoom: BANGALORE_DEFAULT_ZOOM,
    })
    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    setMapReady(true)
    return () => {
      map.current?.remove()
      map.current = null
      setMapReady(false)
    }
  }, [])

  // Drop markers when pins/visibility change
  useEffect(() => {
    if (!map.current || !pins) return
    markers.current.forEach((m) => m.remove())
    markers.current = []

    pins
      .filter((pin) => !hiddenIds.has(pin.influencer_id))
      .forEach((pin) => {
        const color = colorForId(pin.influencer_id)
        const el = document.createElement('div')
        el.className = 'w-3 h-3 rounded-full border-[1.5px] border-white cursor-pointer hover:scale-125 transition-transform'
        el.style.backgroundColor = color
        el.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.1)'

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([pin.lng, pin.lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 12, closeButton: false }).setHTML(
              `<div class="w-56 bg-surface">
                 ${
                   pin.photos[0]
                     ? `<div class="h-28 w-full border-b border-outline-variant overflow-hidden"><img src="${pin.photos[0]}" class="w-full h-full object-cover" /></div>`
                     : ''
                 }
                 <div class="p-3 flex flex-col gap-1">
                   <p class="font-headline-sm text-headline-sm text-on-surface m-0">${pin.restaurant_name}</p>
                   ${pin.vibe_tag ? `<p class="font-label-caps text-label-caps text-secondary uppercase m-0">${pin.vibe_tag}</p>` : ''}
                 </div>
               </div>`,
            ),
          )
          .addTo(map.current!)
        markers.current.push(marker)
      })
  }, [pins, hiddenIds])

  // While picking a pin location: crosshair cursor, capture the next map click
  useEffect(() => {
    if (!map.current || !addPinMode) return
    const canvas = map.current.getCanvas()
    canvas.style.cursor = 'crosshair'

    const handleClick = (e: mapboxgl.MapMouseEvent) => {
      const { lat, lng } = e.lngLat
      if (
        lat < BANGALORE_BBOX.lat.min ||
        lat > BANGALORE_BBOX.lat.max ||
        lng < BANGALORE_BBOX.lng.min ||
        lng > BANGALORE_BBOX.lng.max
      ) {
        setPickError('Please pick a location within Bangalore.')
        return
      }
      setPickError(null)
      setAddPinMode(false)
      setPendingLocation({ lat, lng })
    }

    map.current.on('click', handleClick)
    return () => {
      canvas.style.cursor = ''
      map.current?.off('click', handleClick)
    }
  }, [addPinMode])

  const toggleVisible = (influencerId: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      if (next.has(influencerId)) next.delete(influencerId)
      else next.add(influencerId)
      return next
    })
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <TopNavBar />
      <div className="flex flex-1 mt-12 relative">
        <SideNavBar
          onAddPin={
            currentUser?.role === 'influencer'
              ? () => {
                  setPickError(null)
                  setAddPinMode(true)
                }
              : undefined
          }
        >
          <div className="px-4 py-3 font-label-caps text-label-caps text-secondary uppercase">
            Followed Curators
          </div>
          <div className="flex flex-col flex-1 overflow-y-auto">
            {followedInfluencers.length === 0 && (
              <p className="px-4 py-2 font-body-sm text-body-sm text-secondary">
                Follow influencers on Discover to see their pins here.
              </p>
            )}
            {followedInfluencers.map((inf) => {
              const visible = !hiddenIds.has(inf.id)
              return (
                <div
                  key={inf.id}
                  className="flex items-center justify-between px-4 py-3 border-b border-outline-variant hover:bg-surface-container-low cursor-pointer"
                  onClick={() => toggleVisible(inf.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: colorForId(inf.id) }}
                    />
                    <span className="font-body-base text-body-base text-on-surface truncate">
                      @{inf.handle}
                    </span>
                  </div>
                  <label
                    className="relative inline-flex items-center cursor-pointer shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={visible}
                      onChange={() => toggleVisible(inf.id)}
                    />
                    <div className="w-7 h-4 bg-surface-dim peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-outline-variant after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary border border-outline-variant" />
                  </label>
                </div>
              )
            })}
          </div>
        </SideNavBar>

        <main className="flex-1 w-full md:ml-[220px] relative">
          <div ref={mapContainer} className="absolute inset-0" />

          {addPinMode && mapReady && map.current && (
            <div className="absolute top-4 left-4 z-30 w-72">
              <SearchBox
                accessToken={MAPBOX_TOKEN}
                map={map.current}
                mapboxgl={mapboxgl}
                options={{
                  bbox: [BANGALORE_BBOX.lng.min, BANGALORE_BBOX.lat.min, BANGALORE_BBOX.lng.max, BANGALORE_BBOX.lat.max],
                  proximity: BANGALORE_CENTER,
                }}
                placeholder="Search for a location in Bangalore"
              />
            </div>
          )}

          {isLoading && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-surface border border-outline-variant px-4 py-2 flex items-center gap-2 font-body-base text-body-base text-secondary">
              <Spinner size={4} />
              Loading pins…
            </div>
          )}
          {!isLoading && pins?.length === 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-surface border border-outline-variant px-4 py-2 font-body-base text-body-base text-secondary">
              Follow some influencers on Discover to see their pins here
            </div>
          )}

          {addPinMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-surface border border-outline-variant px-4 py-2 flex items-center gap-3 font-body-base text-body-base text-on-surface">
              Click a location on the map to place your pin
              <button
                onClick={() => setAddPinMode(false)}
                className="font-label-caps text-label-caps text-secondary hover:text-primary uppercase"
              >
                Cancel
              </button>
            </div>
          )}
          {pickError && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-surface border border-red-300 text-red-600 px-4 py-2 font-body-base text-body-base">
              {pickError}
            </div>
          )}
          {successMessage && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-surface border border-primary text-primary px-4 py-2 font-body-base text-body-base">
              {successMessage}
            </div>
          )}
        </main>
      </div>
      <BottomNavBar />

      {pendingLocation && (
        <PinFormModal
          lat={pendingLocation.lat}
          lng={pendingLocation.lng}
          onClose={() => setPendingLocation(null)}
          onSuccess={() => {
            setPendingLocation(null)
            setSuccessMessage('Pin saved!')
            setTimeout(() => setSuccessMessage(null), 3000)
          }}
        />
      )}
    </div>
  )
}
