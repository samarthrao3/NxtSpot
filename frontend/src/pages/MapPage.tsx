import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import mapboxgl from 'mapbox-gl'
import { SearchBox } from '@mapbox/search-js-react'
import { MAPBOX_TOKEN, BANGALORE_BBOX, BANGALORE_CENTER, BANGALORE_DEFAULT_ZOOM, MAP_STYLE } from '@/lib/mapbox'
import { feedApi, influencersApi, pinsApi, savedPinsApi, subscriptionsApi, type Pin } from '@/lib/api'
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

  const { data: feedGroups, isLoading } = useQuery({
    queryKey: ['feed'],
    queryFn: async () => {
      const token = await getAppToken()
      return feedApi.get(token)
    },
  })
  const pins = useMemo(() => feedGroups?.flatMap((group) => group.pins), [feedGroups])

  const { data: ownPins } = useQuery({
    queryKey: ['pins', 'influencer', currentUser?.id],
    queryFn: () => pinsApi.getByInfluencer(currentUser!.id),
    enabled: currentUser?.role === 'influencer',
  })

  // Adds the influencer's own pins, plus a saved pin we've been asked to focus on
  // even if its influencer isn't followed
  const markerPins = useMemo(() => {
    const result = [...(pins ?? [])]
    const addIfMissing = (p?: Pin) => {
      if (p && !result.some((r) => r.id === p.id)) result.push(p)
    }
    ownPins?.forEach(addIfMissing)
    addIfMissing(focusPin)
    return result
  }, [pins, ownPins, focusPin])

  const { data: following } = useQuery({
    queryKey: ['following'],
    queryFn: async () => {
      const token = await getAppToken()
      return subscriptionsApi.getFollowing(token)
    },
  })

  const PAGE_SIZE = 12
  const {
    data: influencerPages,
    isFetchingNextPage: fetchingInfluencers,
    fetchNextPage: fetchInfluencerPage,
    hasNextPage: hasMoreInfluencers,
  } = useInfiniteQuery({
    queryKey: ['influencers'],
    queryFn: ({ pageParam }) => influencersApi.getPage(PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _all, lastPageParam) =>
      lastPage.has_more ? lastPageParam + PAGE_SIZE : undefined,
  })

  useEffect(() => {
    if (hasMoreInfluencers && !fetchingInfluencers) fetchInfluencerPage()
  }, [hasMoreInfluencers, fetchingInfluencers, fetchInfluencerPage])

  const allInfluencers = influencerPages?.pages.flatMap((p) => p.items) ?? []
  const followingIds = new Set(following?.map((f) => f.influencer_id))
  const followedInfluencers = allInfluencers.filter((inf) => followingIds.has(inf.id))

  const unfollow = useMutation({
    mutationFn: async (influencerId: string) => {
      const token = await getAppToken()
      return subscriptionsApi.unfollow(influencerId, token)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['following'] })
      qc.invalidateQueries({ queryKey: ['feed'] })
    },
  })

  const spotterInfluencers = useMemo(() => {
    if (!selectedPin || !markerPins || !allInfluencers) return []
    const pinnerIds = new Set(
      markerPins
        .filter(
          p =>
            p.restaurant_name.toLowerCase() === selectedPin.restaurant_name.toLowerCase() &&
            followingIds.has(p.influencer_id),
        )
        .map(p => p.influencer_id),
    )
    return allInfluencers.filter(inf => pinnerIds.has(inf.id))
  }, [selectedPin, markerPins, allInfluencers, followingIds])

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

  // Drop markers when pins/visibility change
  useEffect(() => {
    if (!map.current || !markerPins) return
    markers.current.forEach((m) => m.remove())
    markers.current = []
    popups.current.forEach((p) => p.remove())
    popups.current = []

    markerPins
      .filter((pin) => !hiddenIds.has(pin.influencer_id))
      .forEach((pin) => {
        const color = colorForId(pin.influencer_id)
        const influencer = allInfluencers?.find((inf) => inf.id === pin.influencer_id)

        const el = document.createElement('div')
        el.className = 'flex flex-col items-center cursor-pointer'

        const avatar = document.createElement('div')
        avatar.className =
          'w-9 h-9 rounded-full border-2 border-white overflow-hidden flex items-center justify-center hover:scale-110 transition-transform'
        avatar.style.backgroundColor = color
        avatar.style.boxShadow = '0 1px 4px rgba(0,0,0,0.35)'
        if (influencer?.avatar_url) {
          const img = document.createElement('img')
          img.src = influencer.avatar_url
          img.className = 'w-full h-full object-cover'
          avatar.appendChild(img)
        } else {
          const initial = document.createElement('span')
          initial.className = 'text-white font-label-caps text-label-caps'
          initial.textContent = (influencer?.name ?? '?').charAt(0).toUpperCase()
          avatar.appendChild(initial)
        }

        const tail = document.createElement('div')
        tail.style.width = '0'
        tail.style.height = '0'
        tail.style.marginTop = '-2px'
        tail.style.borderLeft = '5px solid transparent'
        tail.style.borderRight = '5px solid transparent'
        tail.style.borderTop = `7px solid ${color}`

        el.appendChild(avatar)
        el.appendChild(tail)

        const tags = [pin.vibe_tag, pin.price_range].filter(Boolean).join(' · ')

        // Hover popup: limited info only (photo, name, rating, tags)
        const hoverEl = document.createElement('div')
        hoverEl.className = 'w-56 bg-surface'
        if (pin.photos[0]) {
          const photoWrap = document.createElement('div')
          photoWrap.className = 'h-28 w-full border-b border-outline-variant overflow-hidden'
          const img = document.createElement('img')
          img.src = pin.photos[0]
          img.className = 'w-full h-full object-cover'
          photoWrap.appendChild(img)
          hoverEl.appendChild(photoWrap)
        }
        const hoverBody = document.createElement('div')
        hoverBody.className = 'p-3 flex flex-col gap-1'
        const titleRow = document.createElement('div')
        titleRow.className = 'flex items-start justify-between gap-2'
        const title = document.createElement('p')
        title.className = 'font-headline-sm text-headline-sm text-on-surface m-0'
        title.textContent = pin.restaurant_name
        titleRow.appendChild(title)
        if (pin.rating) {
          const rating = document.createElement('span')
          rating.className = 'font-label-caps text-label-caps text-primary whitespace-nowrap'
          rating.textContent = `★ ${pin.rating}`
          titleRow.appendChild(rating)
        }
        hoverBody.appendChild(titleRow)
        if (tags) {
          const tagsEl = document.createElement('p')
          tagsEl.className = 'font-label-caps text-label-caps text-secondary uppercase m-0'
          tagsEl.textContent = tags
          hoverBody.appendChild(tagsEl)
        }
        hoverEl.appendChild(hoverBody)

        const hoverPopup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 24,
          maxWidth: '240px',
        }).setDOMContent(hoverEl)
        popups.current.push(hoverPopup)

        let hoverTimeout: ReturnType<typeof setTimeout> | null = null
        const showPopup = () => {
          if (hoverTimeout) { clearTimeout(hoverTimeout); hoverTimeout = null }
          if (!hoverPopup.isOpen()) {
            hoverPopup.setLngLat([pin.lng, pin.lat]).addTo(map.current!)
          }
          // Attach listeners to the full popup container (tip + content + padding)
          // once per DOM element so the entire visible area keeps the popup alive.
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
          setSelectedPin(pin)
        })

        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([pin.lng, pin.lat])
          .addTo(map.current!)
        markers.current.push(marker)
      })
  }, [markerPins, hiddenIds, allInfluencers])

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
          {!isLoading && pins?.length === 0 && (
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
                    {(() => {
                      const count = markerPins?.filter(
                        p => p.restaurant_name.toLowerCase() === selectedPin.restaurant_name.toLowerCase()
                      ).length ?? 1
                      return (
                        <button
                          onClick={() => setSpottersPanelOpen(true)}
                          className="border border-primary px-2 py-1 font-label-caps text-label-caps text-primary hover:bg-primary hover:text-on-primary transition-colors"
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
