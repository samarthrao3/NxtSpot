import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import mapboxgl from 'mapbox-gl'
import { SearchBox } from '@mapbox/search-js-react'
import { MAPBOX_TOKEN, BANGALORE_BBOX, BANGALORE_MAX_BOUNDS, BANGALORE_CENTER, BANGALORE_DEFAULT_ZOOM, MAP_STYLE } from '@/lib/mapbox'
import { feedApi, pinsApi, savedPinsApi, subscriptionsApi, type Pin } from '@/lib/api'
import { getAppToken } from '@/lib/auth'
import { useCurrentUser } from '@/lib/useCurrentUser'
import { colorForId } from '@/lib/colors'
import { TopNavBar } from '@/components/ui/TopNavBar'
import { SideNavBar } from '@/components/ui/SideNavBar'
import { BottomNavBar } from '@/components/ui/BottomNavBar'
import { Spinner } from '@/components/ui/Spinner'
import { Icon } from '@/components/ui/Icon'
import { PinFormModal } from '@/components/pins/PinFormModal'

mapboxgl.accessToken = MAPBOX_TOKEN

export function MapPage() {
  const qc = useQueryClient()
  const location = useLocation()
  const focusPin = (location.state as { focusPin?: Pin } | null)?.focusPin
  const lastFocusedId = useRef<string | null>(null)
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markers = useRef<mapboxgl.Marker[]>([])
  const popups = useRef<mapboxgl.Popup[]>([])
  const [mapReady, setMapReady] = useState(false)
  const [mapMoving, setMapMoving] = useState(false)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [addPinMode, setAddPinMode] = useState(false)
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number; name?: string } | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null)
  const [editingPin, setEditingPin] = useState<Pin | null>(null)
  const [confirmingDeletePin, setConfirmingDeletePin] = useState(false)
  const [spottersPanelOpen, setSpottersPanelOpen] = useState(false)
  const [spottersClosing, setSpottersClosing] = useState(false)

  const closeSpottersPanel = () => {
    setSpottersClosing(true)
    setTimeout(() => {
      setSpottersPanelOpen(false)
      setSpottersClosing(false)
    }, 250)
  }

  const { data: currentUser } = useCurrentUser()
  const isOwnPin = !!selectedPin && currentUser?.role === 'influencer' && selectedPin.influencer_id === currentUser.id

  useEffect(() => {
    setConfirmingDeletePin(false)
    setSpottersPanelOpen(false)
    setSpottersClosing(false)
  }, [selectedPin?.id])

  const { data: savedPins } = useQuery({
    queryKey: ['saved-pins'],
    queryFn: async () => {
      const token = await getAppToken()
      return savedPinsApi.getAll(token)
    },
  })
  const savedIds = new Set(savedPins?.map((p) => p.id))

  const save = useMutation({
    mutationFn: async (pinId: string) => {
      const token = await getAppToken()
      return savedPinsApi.save(pinId, token)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-pins'] }),
  })
  const unsave = useMutation({
    mutationFn: async (pinId: string) => {
      const token = await getAppToken()
      return savedPinsApi.unsave(pinId, token)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-pins'] }),
  })
  const handleSaveToggle = (pinId: string) => {
    if (savedIds.has(pinId)) unsave.mutate(pinId)
    else save.mutate(pinId)
  }

  const deletePin = useMutation({
    mutationFn: async (pinId: string) => {
      const token = await getAppToken()
      return pinsApi.delete(pinId, token)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed'] })
      qc.invalidateQueries({ queryKey: ['pins'] })
      setSelectedPin(null)
      setConfirmingDeletePin(false)
      setSuccessMessage('Pin deleted')
      setTimeout(() => setSuccessMessage(null), 3000)
    },
  })

  const { data: restaurantGroups, isLoading } = useQuery({
    queryKey: ['feed'],
    queryFn: async () => {
      const token = await getAppToken()
      return feedApi.get(token)
    },
  })

  const { data: ownPins } = useQuery({
    queryKey: ['pins', 'influencer', currentUser?.id],
    queryFn: () => pinsApi.getByInfluencer(currentUser!.id),
    enabled: currentUser?.role === 'influencer',
  })

  const { data: followingInfluencers = [] } = useQuery({
    queryKey: ['following-influencers'],
    queryFn: async () => {
      const token = await getAppToken()
      return subscriptionsApi.getFollowingInfluencers(token)
    },
  })

  const followedInfluencers = followingInfluencers

  const unfollow = useMutation({
    mutationFn: async (influencerId: string) => {
      const token = await getAppToken()
      return subscriptionsApi.unfollow(influencerId, token)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['following'] })
      qc.invalidateQueries({ queryKey: ['following-influencers'] })
      qc.invalidateQueries({ queryKey: ['feed'] })
    },
  })

  // The backend groups pins by restaurant — no frontend string matching needed.
  // spotterInfluencers finds the group for the selected pin and maps its visible
  // pins (not toggled off) to followed influencer objects for the spotters panel.
  const spotterInfluencers = useMemo(() => {
    if (!selectedPin || !restaurantGroups) return []
    const key = selectedPin.restaurant_name.toLowerCase().trim()
    const group = restaurantGroups.find((g) => g.restaurant_key === key)
    if (!group) return []
    const visiblePins = group.pins.filter((p) => !hiddenIds.has(p.influencer_id))
    const pinnerIds = new Set(visiblePins.map((p) => p.influencer_id))
    return followingInfluencers.filter((inf) => pinnerIds.has(inf.id))
  }, [selectedPin, restaurantGroups, hiddenIds, followingInfluencers])

  // Initialise map
  useEffect(() => {
    if (map.current || !mapContainer.current) return
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: BANGALORE_CENTER,
      zoom: BANGALORE_DEFAULT_ZOOM,
      maxBounds: BANGALORE_MAX_BOUNDS,
    })
    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.current.on('movestart', () => setMapMoving(true))
    map.current.on('moveend', () => setMapMoving(false))
    setMapReady(true)
    return () => {
      map.current?.remove()
      map.current = null
      setMapReady(false)
    }
  }, [])

  // Fly to and open details for a pin we were sent here to focus on (e.g. from Saved)
  useEffect(() => {
    if (!mapReady || !map.current || !focusPin) return
    if (lastFocusedId.current === focusPin.id) return
    lastFocusedId.current = focusPin.id
    map.current.flyTo({ center: [focusPin.lng, focusPin.lat], zoom: 16, duration: 1200 })
    setSelectedPin(focusPin)
  }, [mapReady, focusPin])

  // Drop markers when restaurant groups or visibility change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!map.current || !mapReady) return
      markers.current.forEach((m) => m.remove())
      markers.current = []
      popups.current.forEach((p) => p.remove())
      popups.current = []

      // One marker per restaurant group — position is the group's canonical lat/lng
      // (backend sets this to the first pin received for that restaurant key).
      restaurantGroups
        ?.filter((group) => group.pins.some((p) => !hiddenIds.has(p.influencer_id)))
        .forEach((group) => {
          const visiblePins = group.pins.filter((p) => !hiddenIds.has(p.influencer_id))
          const count = visiblePins.length
          const primary = visiblePins[0]
          const isMulti = count > 1
          const color = isMulti ? '#99420d' : colorForId(primary.influencer_id)
          const pinW = isMulti ? 24 : 20
          const pinH = isMulti ? 32 : 28
          const ns = 'http://www.w3.org/2000/svg'
          const svg = document.createElementNS(ns, 'svg')
          svg.setAttribute('width', String(pinW))
          svg.setAttribute('height', String(pinH))
          svg.setAttribute('viewBox', `0 0 ${pinW} ${pinH}`)
          svg.style.cssText = 'display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.35));'
          const pathEl = document.createElementNS(ns, 'path')
          pathEl.setAttribute('d', isMulti
            ? 'M12,0 C5.37,0 0,5.37 0,11 C0,19.75 12,32 12,32 C12,32 24,19.75 24,11 C24,5.37 18.63,0 12,0 Z'
            : 'M10,0 C4.48,0 0,4.48 0,9 C0,16.5 10,28 10,28 C10,28 20,16.5 20,9 C20,4.48 15.52,0 10,0 Z')
          pathEl.setAttribute('fill', color)
          pathEl.setAttribute('stroke', 'white')
          pathEl.setAttribute('stroke-width', '1.5')
          svg.appendChild(pathEl)
          if (isMulti) {
            const t = document.createElementNS(ns, 'text')
            t.setAttribute('x', '12')
            t.setAttribute('y', '11')
            t.setAttribute('text-anchor', 'middle')
            t.setAttribute('dominant-baseline', 'central')
            t.setAttribute('font-family', 'system-ui,sans-serif')
            t.setAttribute('font-size', '9')
            t.setAttribute('font-weight', '700')
            t.setAttribute('fill', 'white')
            t.setAttribute('pointer-events', 'none')
            t.textContent = String(count)
            svg.appendChild(t)
          } else {
            const dot = document.createElementNS(ns, 'circle')
            dot.setAttribute('cx', '10')
            dot.setAttribute('cy', '9')
            dot.setAttribute('r', '3.5')
            dot.setAttribute('fill', 'white')
            dot.setAttribute('fill-opacity', '0.5')
            dot.setAttribute('pointer-events', 'none')
            svg.appendChild(dot)
          }
          const el = document.createElement('div')
          el.style.cssText = 'cursor:pointer;'
          el.appendChild(svg)

          // Desktop-only hover popup: restaurant name + spotter count, no images
          const hoverEl = document.createElement('div')
          const hoverBody = document.createElement('div')
          hoverBody.className = 'p-2 flex flex-col gap-1 bg-surface'
          const hoverTitle = document.createElement('p')
          hoverTitle.className = 'font-headline-sm text-headline-sm text-on-surface m-0'
          hoverTitle.textContent = primary.restaurant_name
          hoverBody.appendChild(hoverTitle)
          if (isMulti) {
            const spotterLine = document.createElement('p')
            spotterLine.className = 'font-label-caps text-label-caps text-secondary uppercase m-0'
            spotterLine.textContent = `${count} curators recommended this`
            hoverBody.appendChild(spotterLine)
          }
          hoverEl.appendChild(hoverBody)

          const hoverPopup = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: [0, -pinH] as [number, number],
            maxWidth: '200px',
          }).setDOMContent(hoverEl)
          popups.current.push(hoverPopup)

          let hoverTimeout: ReturnType<typeof setTimeout> | null = null
          const showPopup = () => {
            if (hoverTimeout) { clearTimeout(hoverTimeout); hoverTimeout = null }
            if (!hoverPopup.isOpen()) {
              hoverPopup.setLngLat([group.lng, group.lat]).addTo(map.current!)
            }
            const popupEl = hoverPopup.getElement()
            if (popupEl && !popupEl.dataset.listenersAttached) {
              popupEl.dataset.listenersAttached = 'true'
              popupEl.addEventListener('mouseenter', showPopup)
              popupEl.addEventListener('mouseleave', hidePopup)
            }
          }
          const hidePopup = () => {
            hoverTimeout = setTimeout(() => hoverPopup.remove(), 120)
          }

          el.addEventListener('mouseenter', () => {
            if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) showPopup()
          })
          el.addEventListener('mouseleave', () => {
            if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) hidePopup()
          })
          el.addEventListener('click', () => {
            hoverPopup.remove()
            setSelectedPin(primary)
            if (isMulti) setSpottersPanelOpen(true)
          })

          const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([group.lng, group.lat])
            .addTo(map.current!)
          markers.current.push(marker)
        })

      // Influencer's own pins — not in the feed (self-follow is blocked by the backend)
      ownPins?.forEach((pin) => {
        if (hiddenIds.has(pin.influencer_id)) return
        const ownColor = colorForId(pin.influencer_id)
        const sns = 'http://www.w3.org/2000/svg'
        const ownSvg = document.createElementNS(sns, 'svg')
        ownSvg.setAttribute('width', '20')
        ownSvg.setAttribute('height', '28')
        ownSvg.setAttribute('viewBox', '0 0 20 28')
        ownSvg.style.cssText = 'display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.35));'
        const ownPath = document.createElementNS(sns, 'path')
        ownPath.setAttribute('d', 'M10,0 C4.48,0 0,4.48 0,9 C0,16.5 10,28 10,28 C10,28 20,16.5 20,9 C20,4.48 15.52,0 10,0 Z')
        ownPath.setAttribute('fill', ownColor)
        ownPath.setAttribute('stroke', 'white')
        ownPath.setAttribute('stroke-width', '1.5')
        ownSvg.appendChild(ownPath)
        const ownDot = document.createElementNS(sns, 'circle')
        ownDot.setAttribute('cx', '10')
        ownDot.setAttribute('cy', '9')
        ownDot.setAttribute('r', '3.5')
        ownDot.setAttribute('fill', 'white')
        ownDot.setAttribute('fill-opacity', '0.5')
        ownDot.setAttribute('pointer-events', 'none')
        ownSvg.appendChild(ownDot)
        const el = document.createElement('div')
        el.style.cssText = 'cursor:pointer;'
        el.appendChild(ownSvg)
        el.addEventListener('click', () => setSelectedPin(pin))
        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([pin.lng, pin.lat])
          .addTo(map.current!)
        markers.current.push(marker)
      })
    }, 100)
    return () => clearTimeout(timer)
  }, [restaurantGroups, ownPins, hiddenIds, mapReady])

  const tryPlaceLocation = (lat: number, lng: number, name?: string) => {
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
    setPendingLocation({ lat, lng, name })
  }

  // While picking a pin location: crosshair cursor, capture the next map click
  useEffect(() => {
    if (!map.current || !addPinMode) return
    const canvas = map.current.getCanvas()
    canvas.style.cursor = 'crosshair'

    const handleClick = (e: mapboxgl.MapMouseEvent) => {
      tryPlaceLocation(e.lngLat.lat, e.lngLat.lng)
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

  const allToggleIds = followedInfluencers.map((inf) => inf.id)
  const allVisible = allToggleIds.length > 0 && allToggleIds.every((id) => !hiddenIds.has(id))

  const toggleAll = () => {
    if (allVisible) {
      setHiddenIds(new Set(allToggleIds))
    } else {
      setHiddenIds(new Set())
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <TopNavBar />
      <div className="flex flex-1 mt-12 relative">
        <SideNavBar
          pinOpen={!!selectedPin || mapMoving}
          onAddPin={
            currentUser?.role === 'influencer'
              ? () => {
                  setPickError(null)
                  setAddPinMode(true)
                }
              : undefined
          }
        >
          {currentUser?.role === 'influencer' && (
            <>
              <div className="px-4 py-3 font-label-caps text-label-caps text-secondary uppercase">My Pins</div>
              <div
                className="flex items-center justify-between px-4 py-3 border-b border-outline-variant hover:bg-surface-container-low cursor-pointer"
                onClick={() => toggleVisible(currentUser.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: colorForId(currentUser.id) }}
                  />
                  <span className="font-body-base text-body-base text-on-surface truncate">
                    @{currentUser.handle}
                  </span>
                </div>
                <label
                  className="relative inline-flex items-center cursor-pointer shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={!hiddenIds.has(currentUser.id)}
                    onChange={() => toggleVisible(currentUser.id)}
                  />
                  <div className="w-7 h-4 bg-surface-dim peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-outline-variant after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary border border-outline-variant" />
                </label>
              </div>
            </>
          )}

          <div className="flex items-center justify-between px-4 py-3">
            <span className="font-label-caps text-label-caps text-secondary uppercase">Followed Curators</span>
            {followedInfluencers.length > 0 && (
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={allVisible}
                  onChange={toggleAll}
                />
                <div className="w-7 h-4 bg-surface-dim peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-outline-variant after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary border border-outline-variant" />
              </label>
            )}
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

        <main className="flex-1 w-full relative">
          <div ref={mapContainer} className="absolute inset-0" />

          {addPinMode && mapReady && map.current && (
            <div className="absolute top-4 left-16 z-30 w-72">
              <SearchBox
                accessToken={MAPBOX_TOKEN}
                map={map.current}
                mapboxgl={mapboxgl}
                options={{
                  bbox: [BANGALORE_BBOX.lng.min, BANGALORE_BBOX.lat.min, BANGALORE_BBOX.lng.max, BANGALORE_BBOX.lat.max],
                  proximity: BANGALORE_CENTER,
                }}
                placeholder="Search for a location in Bangalore"
                onRetrieve={(res) => {
                  const feature = res.features[0]
                  if (!feature) return
                  const { latitude, longitude } = feature.properties.coordinates
                  tryPlaceLocation(latitude, longitude, feature.properties.name)
                }}
              />
            </div>
          )}

          {isLoading && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-surface border border-outline-variant px-4 py-2 flex items-center gap-2 font-body-base text-body-base text-secondary">
              <Spinner size={4} />
              Loading pins…
            </div>
          )}
          {!isLoading && (restaurantGroups?.length ?? 0) === 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-surface border border-outline-variant px-4 py-2 font-body-base text-body-base text-secondary">
              Follow some influencers on Discover to see their pins here
            </div>
          )}

          {addPinMode && (
            <div className="absolute top-16 md:top-4 left-1/2 -translate-x-1/2 z-20 bg-surface border border-outline-variant px-4 py-2 flex items-center gap-3 font-body-base text-body-base text-on-surface">
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

          {selectedPin && (
            <aside className="absolute top-0 right-0 h-full w-full md:w-[400px] bg-surface border-l border-outline-variant z-40 flex flex-col overflow-y-auto animate-slide-in-right">
              <div className="sticky top-0 bg-surface z-10 flex justify-between items-center p-4 border-b border-outline-variant">
                {confirmingDeletePin ? (
                  <>
                    <span className="font-body-sm text-body-sm text-on-surface">Delete this pin?</span>
                    <div className="flex items-center gap-2">
                      {deletePin.isError && (
                        <span className="font-body-sm text-body-sm text-red-600">Failed.</span>
                      )}
                      <button
                        onClick={() => setConfirmingDeletePin(false)}
                        className="font-label-caps text-label-caps text-secondary hover:text-on-surface uppercase transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => deletePin.mutate(selectedPin.id)}
                        disabled={deletePin.isPending}
                        className="px-3 py-1 bg-red-600 text-white font-label-caps text-label-caps uppercase hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        {deletePin.isPending ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setSelectedPin(null)}
                      className="text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                      <Icon name="close" />
                    </button>
                    {isOwnPin ? (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setConfirmingDeletePin(true)}
                          className="text-on-surface-variant hover:text-red-600 transition-colors"
                        >
                          <Icon name="delete" />
                        </button>
                        <button
                          onClick={() => setEditingPin(selectedPin)}
                          className="text-on-surface-variant hover:text-primary transition-colors"
                        >
                          <Icon name="edit" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSaveToggle(selectedPin.id)}
                        className={`transition-colors ${
                          savedIds.has(selectedPin.id) ? 'text-primary' : 'text-on-surface-variant hover:text-primary'
                        }`}
                      >
                        <Icon name="bookmark" filled={savedIds.has(selectedPin.id)} />
                      </button>
                    )}
                  </>
                )}
              </div>

              <div className="p-4 flex flex-col flex-1">
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
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
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
                    {(() => {
                      const group = restaurantGroups?.find(
                        (g) => g.restaurant_key === selectedPin.restaurant_name.toLowerCase().trim()
                      )
                      const count = group?.pins.filter((p) => !hiddenIds.has(p.influencer_id)).length ?? 1
                      return (
                        <button
                          onClick={() => setSpottersPanelOpen(true)}
                          className="shrink-0 border border-primary px-2 py-1 font-label-caps text-label-caps text-primary hover:bg-primary hover:text-on-primary transition-colors"
                        >
                          {count} {count === 1 ? 'spotter' : 'spotters'} recommended this →
                        </button>
                      )
                    })()}
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

                  <div className="mt-auto pt-6 pb-16 md:pb-0 border-t border-outline-variant">
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${selectedPin.lat},${selectedPin.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-3 bg-[#1A1A1A] text-white font-label-caps text-label-caps tracking-wider hover:bg-[#333333] transition-colors border border-[#1A1A1A] flex items-center justify-center gap-2"
                    >
                      <Icon name="directions" className="text-[18px]" />
                      GET DIRECTIONS
                    </a>
                  </div>
                </div>
              </div>
            </aside>
          )}

          {spottersPanelOpen && selectedPin && (
            <aside className={`absolute top-0 right-0 h-full w-full md:w-[400px] bg-surface border-l border-outline-variant z-50 flex flex-col ${spottersClosing ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}>
              <div className="sticky top-0 bg-surface z-10 flex items-center gap-3 p-4 border-b border-outline-variant">
                <button
                  onClick={closeSpottersPanel}
                  className="text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  <Icon name="arrow_back" />
                </button>
                <span className="font-headline-sm text-headline-sm text-on-surface">
                  Recommended by
                </span>
              </div>

              <div className="flex flex-col overflow-y-auto">
                {spotterInfluencers.length === 0 ? (
                  <p className="px-4 py-6 font-body-sm text-body-sm text-secondary">
                    None of the spotters you follow have recommended this place.
                  </p>
                ) : (
                  spotterInfluencers.map(inf => (
                    <div
                      key={inf.id}
                      className="flex items-center justify-between px-4 py-3 border-b border-outline-variant"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-outline-variant shrink-0 bg-surface-container">
                          {inf.avatar_url ? (
                            <img src={inf.avatar_url} alt={inf.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                          ) : (
                            <span className="w-full h-full flex items-center justify-center font-label-caps text-label-caps text-on-surface-variant">
                              {inf.name[0]}
                            </span>
                          )}
                        </div>
                        <span className="font-body-base text-body-base text-on-surface truncate">
                          @{inf.handle}
                        </span>
                      </div>
                      <button
                        onClick={() => unfollow.mutate(inf.id)}
                        disabled={unfollow.isPending && unfollow.variables === inf.id}
                        className="shrink-0 ml-4 px-3 py-1 border border-outline-variant font-label-caps text-label-caps text-on-surface hover:border-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
                      >
                        {unfollow.isPending && unfollow.variables === inf.id ? 'Unfollowing…' : 'Unfollow'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </aside>
          )}
        </main>
      </div>
      <BottomNavBar />

      {pendingLocation && (
        <PinFormModal
          lat={pendingLocation.lat}
          lng={pendingLocation.lng}
          initialName={pendingLocation.name}
          onClose={() => setPendingLocation(null)}
          onSuccess={() => {
            setPendingLocation(null)
            setSuccessMessage('Pin saved!')
            setTimeout(() => setSuccessMessage(null), 3000)
          }}
        />
      )}

      {editingPin && (
        <PinFormModal
          lat={editingPin.lat}
          lng={editingPin.lng}
          pin={editingPin}
          onClose={() => setEditingPin(null)}
          onSuccess={() => {
            setEditingPin(null)
            setSelectedPin(null)
            setSuccessMessage('Pin updated!')
            setTimeout(() => setSuccessMessage(null), 3000)
          }}
        />
      )}
    </div>
  )
}
