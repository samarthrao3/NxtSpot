import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import mapboxgl from 'mapbox-gl'
import { SearchBox } from '@mapbox/search-js-react'
import { Icon as LucideIcon } from 'lucide-react'
import { MAPBOX_TOKEN, BANGALORE_BBOX, BANGALORE_MAX_BOUNDS, BANGALORE_CENTER, BANGALORE_DEFAULT_ZOOM, MAP_STYLE } from '@/lib/mapbox'
import { feedApi, pinsApi, savedPinsApi, subscriptionsApi, type Pin, type PinSearchResult } from '@/lib/api'
import { getAppToken } from '@/lib/auth'
import { useCurrentUser } from '@/lib/useCurrentUser'
import { colorForId } from '@/lib/colors'
import { CATEGORIES, categoryStyle } from '@/lib/categories'
import { createPinMarkerElement } from '@/lib/markers'
import { CategoryBadge } from '@/components/pins/CategoryBadge'
import { TopNavBar } from '@/components/ui/TopNavBar'
import { SideNavBar } from '@/components/ui/SideNavBar'
import { BottomNavBar } from '@/components/ui/BottomNavBar'
import { Spinner } from '@/components/ui/Spinner'
import { Icon } from '@/components/ui/Icon'
import { PinFormModal } from '@/components/pins/PinFormModal'

mapboxgl.accessToken = MAPBOX_TOKEN

// Small switch used throughout the side-nav filter groups.
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer shrink-0" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={onChange} />
      <div className="w-7 h-4 bg-surface-dim peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-outline-variant after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary border border-outline-variant" />
    </label>
  )
}

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
  const [sideNavOpen, setSideNavOpen] = useState(false)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set())
  const [curatorsExpanded, setCuratorsExpanded] = useState(false)
  const [categoriesExpanded, setCategoriesExpanded] = useState(false)
  const [addPinMode, setAddPinMode] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number; name?: string } | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null)
  const [hasTappedPin, setHasTappedPin] = useState(false)
  const [editingPin, setEditingPin] = useState<Pin | null>(null)
  const [confirmingDeletePin, setConfirmingDeletePin] = useState(false)
  const [spottersPanelOpen, setSpottersPanelOpen] = useState(false)
  const [spottersClosing, setSpottersClosing] = useState(false)
  const [pinPixelPos, setPinPixelPos] = useState<{ x: number; y: number } | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [resultsCollapsed, setResultsCollapsed] = useState(false)

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
    setDetailPanelOpen(false)
    if (selectedPin) setHasTappedPin(true)
  }, [selectedPin?.id])

  useEffect(() => {
    if (!selectedPin || !mapReady) { setPinPixelPos(null); return }
    const update = () => {
      if (!map.current) return
      const { x, y } = map.current.project([selectedPin.lng, selectedPin.lat])
      setPinPixelPos({ x, y })
    }
    update()
    map.current?.on('moveend', update)
    return () => { map.current?.off('moveend', update) }
  }, [selectedPin, mapReady])

  useEffect(() => {
    if (!detailPanelOpen) return
    window.history.pushState({ detailPanel: true }, '')
    const handlePop = () => setDetailPanelOpen(false)
    window.addEventListener('popstate', handlePop)
    return () => {
      window.removeEventListener('popstate', handlePop)
      // Panel closed by in-app button — consume the pushed entry
      if (window.history.state?.detailPanel) window.history.back()
    }
  }, [detailPanelOpen])

  // MapPage no longer unmounts when routing away (see PersistentMapPage), so the
  // pushState cleanup above won't run just because the user left /map. Close the
  // panel explicitly so it doesn't linger open — and its history entry — for next time.
  useEffect(() => {
    if (location.pathname !== '/map') setDetailPanelOpen(false)
  }, [location.pathname])

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
    onMutate: async (pinId) => {
      await qc.cancelQueries({ queryKey: ['saved-pins'] })
      const previous = qc.getQueryData<Pin[]>(['saved-pins'])
      if (selectedPin?.id === pinId) {
        qc.setQueryData<Pin[]>(['saved-pins'], (old) => [...(old ?? []), selectedPin])
      }
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

  const { data: followedInfluencers = [] } = useQuery({
    queryKey: ['following-influencers'],
    queryFn: async () => {
      const token = await getAppToken()
      return subscriptionsApi.getFollowingInfluencers(token)
    },
  })

  // Pin search — scoped to followed Spotters by the backend. Fires on submit.
  const isSearching = submittedQuery.trim().length > 0
  const { data: searchData, isFetching: searchFetching } = useQuery({
    queryKey: ['pin-search', submittedQuery],
    queryFn: async () => {
      const token = await getAppToken()
      return pinsApi.search(submittedQuery, token)
    },
    enabled: isSearching,
    placeholderData: (prev) => prev,
  })
  const searchResults = isSearching ? searchData : undefined
  // Set of pin ids that survive the search filter — null means "no filter, show everything".
  const matchedPinIds = useMemo(
    () => (searchResults ? new Set(searchResults.map((p) => p.id)) : null),
    [searchResults],
  )

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchInput.trim()
    if (!q) { clearSearch(); return }
    setResultsCollapsed(true)
    setSubmittedQuery(q)
  }
  const clearSearch = () => {
    setSearchInput('')
    setSubmittedQuery('')
    setResultsCollapsed(false)
  }
  const handleResultClick = (pin: PinSearchResult) => {
    map.current?.flyTo({ center: [pin.lng, pin.lat], zoom: 16, duration: 1000 })
    setSelectedPin(pin)
    setResultsCollapsed(true)
  }

  const spotterInfluencers = useMemo(() => {
    if (!selectedPin || !restaurantGroups) return []
    const key = selectedPin.restaurant_name.toLowerCase().trim()
    const group = restaurantGroups.find((g) => g.restaurant_key === key)
    if (!group) return []
    const visiblePins = group.pins.filter((p) => !hiddenIds.has(p.influencer_id))
    const pinnerIds = new Set(visiblePins.map((p) => p.influencer_id))
    return followedInfluencers.filter((inf) => pinnerIds.has(inf.id))
  }, [selectedPin, restaurantGroups, hiddenIds, followedInfluencers])

  const spotterGroup = useMemo(() => {
    if (!selectedPin || !restaurantGroups) return null
    const key = selectedPin.restaurant_name.toLowerCase().trim()
    return restaurantGroups.find((g) => g.restaurant_key === key) ?? null
  }, [selectedPin, restaurantGroups])

  const selectedAvgRating = useMemo(() => {
    const pins = spotterGroup?.pins ?? (selectedPin ? [selectedPin] : [])
    const rated = pins.filter((p) => p.rating != null)
    if (rated.length === 0) return null
    const avg = rated.reduce((sum, p) => sum + p.rating!, 0) / rated.length
    return avg % 1 === 0 ? String(avg) : avg.toFixed(1)
  }, [spotterGroup, selectedPin])

  // Initialise map
  useEffect(() => {
    if (map.current || !mapContainer.current) return
    const mapOpts: mapboxgl.MapboxOptions & { pixelRatio?: number } = {
      container: mapContainer.current,
      style: MAP_STYLE,
      center: BANGALORE_CENTER,
      zoom: BANGALORE_DEFAULT_ZOOM,
      maxBounds: BANGALORE_MAX_BOUNDS,
      antialias: false,
      dragRotate: false,
      touchPitch: false,
      fadeDuration: 0,
      pixelRatio: Math.min(window.devicePixelRatio, 2),
    }
    map.current = new mapboxgl.Map(mapOpts)
    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.current.on('style.load', () => {
      map.current?.setConfigProperty('basemap', 'lightPreset', 'night')
      map.current?.setConfigProperty('basemap', 'show3dObjects', false)
      map.current?.setConfigProperty('basemap', 'colorMotorways', '#42566e')
      map.current?.setConfigProperty('basemap', 'colorTrunks', '#42566e')
      map.current?.setConfigProperty('basemap', 'colorRoads', '#42566e')
    })
    map.current.on('movestart', () => setMapMoving(true))
    map.current.on('moveend', () => setMapMoving(false))
    setMapReady(true)
    return () => {
      map.current?.remove()
      map.current = null
      setMapReady(false)
    }
  }, [])

  // MapPage stays mounted (and display:none'd) while on other routes so switching
  // back to /map is instant instead of re-initialising Mapbox. The canvas can end up
  // sized wrong after being hidden, so force a resize whenever this route re-activates.
  useEffect(() => {
    if (location.pathname === '/map' && mapReady) map.current?.resize()
  }, [location.pathname, mapReady])

  // Fly to and open details for a pin we were sent here to focus on (e.g. from Saved)
  useEffect(() => {
    if (!mapReady || !map.current || !focusPin) return
    if (lastFocusedId.current === focusPin.id) return
    lastFocusedId.current = focusPin.id
    map.current.flyTo({ center: [focusPin.lng, focusPin.lat], zoom: 16, duration: 1200 })
    setSelectedPin(focusPin)
  }, [mapReady, focusPin])

  // Re-frame the map to the search results so the geographic response is visible.
  useEffect(() => {
    if (!mapReady || !map.current || !searchResults || searchResults.length === 0) return
    const bounds = new mapboxgl.LngLatBounds()
    searchResults.forEach((p) => bounds.extend([p.lng, p.lat]))
    map.current.fitBounds(bounds, {
      padding: { top: 170, bottom: 100, left: 60, right: 60 },
      maxZoom: 15,
      duration: 900,
    })
  }, [searchResults, mapReady])

  // Drop markers when restaurant groups, visibility, or the search filter change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!map.current || !mapReady) return
      markers.current.forEach((m) => m.remove())
      markers.current = []
      popups.current.forEach((p) => p.remove())
      popups.current = []

      // While searching, only pins in the result set stay on the map.
      const passesSearch = (p: Pin) => !matchedPinIds || matchedPinIds.has(p.id)
      const passesCategory = (p: Pin) => !p.category || !hiddenCategories.has(p.category)
      const isVisible = (p: Pin) => !hiddenIds.has(p.influencer_id) && passesSearch(p) && passesCategory(p)

      // One marker per restaurant group — position is the group's canonical lat/lng
      // (backend sets this to the first pin received for that restaurant key).
      restaurantGroups
        ?.filter((group) => group.pins.some(isVisible))
        .forEach((group) => {
          const visiblePins = group.pins.filter(isVisible)
          const count = visiblePins.length
          const primary = visiblePins[0]
          const isMulti = count > 1
          // Pill marker: capsule = influencer colour (amber for multi-curator spots),
          // category icon on the left, rating (group average) on the right.
          const ringColor = isMulti ? '#ffc174' : colorForId(primary.influencer_id)
          const ratedPins = visiblePins.filter((p) => p.rating != null)
          const avgRating = ratedPins.length
            ? ratedPins.reduce((sum, p) => sum + (p.rating as number), 0) / ratedPins.length
            : null
          const el = createPinMarkerElement({ ringColor, category: primary.category, rating: avgRating })

          // Desktop-only hover popup: restaurant name + spotter count, no images
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

          const hoverPopup = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: [0, -29] as [number, number],
            maxWidth: '200px',
          }).setDOMContent(hoverBody)
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

      // Influencer's own pins — not in the feed (self-follow is blocked by the backend).
      // Search is scoped to followed Spotters, so own pins never match — hide them.
      ownPins?.forEach((pin) => {
        if (!isVisible(pin)) return
        const el = createPinMarkerElement({ ringColor: colorForId(pin.influencer_id), category: pin.category, rating: pin.rating })
        el.addEventListener('click', () => setSelectedPin(pin))
        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([pin.lng, pin.lat])
          .addTo(map.current!)
        markers.current.push(marker)
      })
    }, 100)
    return () => clearTimeout(timer)
  }, [restaurantGroups, ownPins, hiddenIds, hiddenCategories, mapReady, matchedPinIds])

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

  const toggleCategory = (cat: string) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const allCategoriesVisible = CATEGORIES.every((c) => !hiddenCategories.has(c))
  const toggleAllCategories = () => {
    setHiddenCategories(allCategoriesVisible ? new Set<string>(CATEGORIES) : new Set())
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-background overflow-hidden">
      <TopNavBar />
      <div className="flex flex-1 mt-12 relative">
        <SideNavBar
          pinOpen={mapMoving || detailPanelOpen}
          onOpenChange={setSideNavOpen}
          onAddPin={
            currentUser?.role === 'influencer'
              ? () => {
                  setPickError(null)
                  setAddPinMode(true)
                }
              : undefined
          }
        >
          {/* My Pins — influencer's own pins (unchanged) */}
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
                <Toggle checked={!hiddenIds.has(currentUser.id)} onChange={() => toggleVisible(currentUser.id)} />
              </div>
            </>
          )}

          {/* Followed Curators — collapsible group */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-outline-variant hover:bg-surface-container-low cursor-pointer select-none"
            onClick={() => setCuratorsExpanded((v) => !v)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Icon name="expand_more" className={`text-[18px] text-secondary transition-transform ${curatorsExpanded ? '' : '-rotate-90'}`} />
              <span className="font-label-caps text-label-caps text-secondary uppercase">Followed Curators</span>
            </div>
            {followedInfluencers.length > 0 && (
              <Toggle checked={allVisible} onChange={toggleAll} />
            )}
          </div>
          {curatorsExpanded && (
            <div className="flex flex-col">
              {followedInfluencers.length === 0 && (
                <p className="px-4 py-2 font-body-sm text-body-sm text-secondary">
                  Follow curators on Discover to see their pins here.
                </p>
              )}
              {followedInfluencers.map((inf) => (
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
                  <Toggle checked={!hiddenIds.has(inf.id)} onChange={() => toggleVisible(inf.id)} />
                </div>
              ))}
            </div>
          )}

          {/* Category — collapsible group; filter pins by kind of place */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-outline-variant hover:bg-surface-container-low cursor-pointer select-none"
            onClick={() => setCategoriesExpanded((v) => !v)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Icon name="expand_more" className={`text-[18px] text-secondary transition-transform ${categoriesExpanded ? '' : '-rotate-90'}`} />
              <span className="font-label-caps text-label-caps text-secondary uppercase">Category</span>
            </div>
            <Toggle checked={allCategoriesVisible} onChange={toggleAllCategories} />
          </div>
          {categoriesExpanded && (
            <div className="flex flex-col">
              {CATEGORIES.map((c) => {
                const { label, color, iconNode } = categoryStyle(c)
                return (
                  <div
                    key={c}
                    className="flex items-center justify-between px-4 py-3 border-b border-outline-variant hover:bg-surface-container-low cursor-pointer"
                    onClick={() => toggleCategory(c)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <LucideIcon iconNode={iconNode} size={16} style={{ color }} className="shrink-0" />
                      <span className="font-body-base text-body-base text-on-surface truncate">
                        {label}
                      </span>
                    </div>
                    <Toggle checked={!hiddenCategories.has(c)} onChange={() => toggleCategory(c)} />
                  </div>
                )
              })}
            </div>
          )}
        </SideNavBar>

        <main className="flex-1 w-full relative">
          <div ref={mapContainer} className="absolute inset-0" />

          {/* Persistent pin search — hidden while picking an add-pin location */}
          {!addPinMode && (
            <div className="absolute top-3 left-16 right-3 md:right-auto md:w-[400px] z-30 flex flex-col gap-2">
              <form
                onSubmit={handleSearchSubmit}
                className="flex items-center gap-2 rounded-full bg-surface-container-low/95 backdrop-blur-sm border border-outline-variant shadow-lg pl-4 pr-1.5 py-1.5 transition-colors focus-within:border-primary"
              >
                <Icon name="search" className="text-on-surface-variant text-[18px] shrink-0" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  enterKeyHint="search"
                  placeholder="Search spots, cuisines, curators…"
                  className="flex-1 min-w-0 bg-transparent font-body-base text-body-base text-on-surface placeholder:text-secondary focus:outline-none"
                />
                {(searchInput || isSearching) && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="shrink-0 text-on-surface-variant hover:text-on-surface transition-colors p-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label="Clear search"
                  >
                    <Icon name="close" className="text-[18px]" />
                  </button>
                )}
                <button
                  type="submit"
                  className="shrink-0 rounded-full bg-primary text-on-primary w-8 h-8 flex items-center justify-center hover:bg-primary-container transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-low"
                  aria-label="Search"
                >
                  <Icon name="arrow_forward" className="text-[18px]" />
                </button>
              </form>

              {isSearching && (
                <div className="rounded-2xl bg-surface-container-low/95 backdrop-blur-sm border border-outline-variant shadow-lg overflow-hidden flex flex-col max-h-[calc(100dvh-16rem)] md:max-h-[70vh]">
                  <button
                    type="button"
                    onClick={() => setResultsCollapsed((v) => !v)}
                    className={`flex items-center justify-between px-4 py-2 shrink-0 text-left ${resultsCollapsed ? '' : 'border-b border-outline-variant'}`}
                    aria-expanded={!resultsCollapsed}
                  >
                    <span className="font-label-caps text-label-caps text-secondary uppercase">
                      {searchFetching && !searchResults
                        ? 'Searching…'
                        : `${searchResults?.length ?? 0} result${(searchResults?.length ?? 0) === 1 ? '' : 's'}`}
                    </span>
                    <div className="flex items-center gap-2">
                      {searchFetching && <Spinner size={4} />}
                      <Icon
                        name="expand_more"
                        className={`text-[18px] text-secondary transition-transform ${resultsCollapsed ? '-rotate-90' : ''}`}
                      />
                    </div>
                  </button>
                  {!resultsCollapsed && (
                  <div className="overflow-y-auto">
                    {searchResults && searchResults.length === 0 && !searchFetching && (
                      <p className="px-4 py-6 font-body-sm text-body-sm text-secondary text-center">
                        No spots found among the Spotters you follow.
                      </p>
                    )}
                    {searchResults?.map((pin) => {
                      const cat = categoryStyle(pin.category)
                      return (
                        <button
                          key={pin.id}
                          onClick={() => handleResultClick(pin)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-container focus:outline-none focus-visible:bg-surface-container transition-colors border-b border-outline-variant last:border-0"
                        >
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-surface-container shrink-0 flex items-center justify-center">
                            {pin.photos[0] ? (
                              <img src={pin.photos[0]} alt={pin.restaurant_name} className="w-full h-full object-cover" />
                            ) : (
                              <LucideIcon iconNode={cat.iconNode} size={22} style={{ color: cat.color }} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-headline-sm text-headline-sm text-on-surface leading-tight">
                              {pin.restaurant_name}
                            </p>
                            <p className="truncate font-body-sm text-body-sm text-secondary">
                              {[pin.category ? cat.label : null, pin.influencer_handle ? `@${pin.influencer_handle}` : pin.influencer_name]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                          {pin.rating != null && (
                            <div className="shrink-0 flex items-center gap-1 rounded-lg bg-surface-container px-2 py-1">
                              <Icon name="star" filled className="text-[12px] text-primary" />
                              <span className="font-label-caps text-label-caps text-on-surface">
                                {pin.rating % 1 === 0 ? pin.rating : pin.rating.toFixed(1)}
                              </span>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  )}
                </div>
              )}
            </div>
          )}

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
            <div className="absolute top-20 md:top-4 left-1/2 -translate-x-1/2 z-10 rounded-full bg-surface-container-low/90 backdrop-blur-sm px-5 py-2 flex items-center gap-2 font-body-base text-body-base text-secondary shadow-lg whitespace-nowrap">
              <Spinner size={4} />
              Loading pins…
            </div>
          )}
          {!isLoading && (restaurantGroups?.length ?? 0) === 0 && (
            <div className="absolute bottom-36 md:bottom-auto md:top-4 left-1/2 -translate-x-1/2 z-30 rounded-2xl bg-surface-container-low/90 backdrop-blur-sm px-5 py-3 shadow-lg max-w-[calc(100%-2rem)] text-center">
              <p className="font-body-sm text-body-sm text-secondary leading-relaxed">
                Follow curators on{' '}
                <Link to="/explore" className="text-primary hover:underline">
                  Discover
                </Link>{' '}
                to see their pins here
              </p>
            </div>
          )}

          {addPinMode && (
            <div className="absolute top-16 md:top-4 left-1/2 -translate-x-1/2 z-20 rounded-full bg-surface-container-low/90 backdrop-blur-sm px-5 py-2.5 flex items-center gap-3 font-body-base text-body-base text-on-surface shadow-lg">
              Tap a spot on the map
              <button
                onClick={() => setAddPinMode(false)}
                className="font-label-caps text-label-caps text-secondary hover:text-primary uppercase"
              >
                Cancel
              </button>
            </div>
          )}
          {pickError && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 rounded-full bg-surface-container-low/90 backdrop-blur-sm px-5 py-2 text-red-400 font-body-base text-body-base shadow-lg">
              {pickError}
            </div>
          )}
          {successMessage && (
            <div className="absolute top-20 md:top-4 left-1/2 -translate-x-1/2 z-20 rounded-full bg-surface-container-low/90 backdrop-blur-sm px-5 py-2 text-primary font-body-base text-body-base shadow-lg whitespace-nowrap">
              {successMessage}
            </div>
          )}

          {mapReady && !isLoading && !hasTappedPin && !selectedPin && (
            <div className="md:hidden absolute bottom-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
              <div className="bg-surface/90 backdrop-blur-sm border border-outline-variant px-4 py-2 rounded-full font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                Go on, tap a pin. It's been waiting.
              </div>
            </div>
          )}

          {selectedPin && pinPixelPos && !detailPanelOpen && !mapMoving && (
            <div
              className="absolute z-40 w-[280px] rounded-2xl overflow-hidden shadow-2xl"
              style={{
                left: pinPixelPos.x,
                top: pinPixelPos.y,
                transform: 'translate(-50%, calc(-100% - 44px))',
                background: 'rgba(28,27,27,0.95)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
              }}
            >

              {/* Cover photo */}
              {selectedPin.photos[0] && (
                <div className="relative w-full overflow-hidden" style={{ height: 140 }}>
                  <img src={selectedPin.photos[0]} alt={selectedPin.restaurant_name} className="w-full h-full object-cover" />
                  {selectedAvgRating != null && (
                    <div className="absolute bottom-2 left-2 rounded-lg bg-black/60 backdrop-blur-sm px-2 py-0.5 flex items-center gap-1">
                      <Icon name="star" filled className="text-[11px] text-primary" />
                      <span className="font-label-caps text-label-caps text-white">{selectedAvgRating}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Header row */}
              <div className="flex items-center justify-between px-3 pt-2.5 pb-1 gap-2">
                <h3 className="font-headline-sm text-headline-sm text-on-surface leading-tight flex-1 min-w-0 truncate">
                  {selectedPin.restaurant_name}
                </h3>
                <div className="flex items-center gap-1 shrink-0">
                  {isOwnPin ? (
                    <>
                      <button onClick={() => setEditingPin(selectedPin)} className="text-on-surface-variant hover:text-primary transition-colors p-0.5">
                        <Icon name="edit" className="text-[18px]" />
                      </button>
                      <button onClick={() => setConfirmingDeletePin(true)} className="text-on-surface-variant hover:text-red-600 transition-colors p-0.5">
                        <Icon name="delete" className="text-[18px]" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleSaveToggle(selectedPin.id)}
                      className={`transition-colors p-0.5 ${savedIds.has(selectedPin.id) ? 'text-primary' : 'text-on-surface-variant hover:text-primary'}`}
                    >
                      <Icon name="bookmark" filled={savedIds.has(selectedPin.id)} className="text-[18px]" />
                    </button>
                  )}
                  <button onClick={() => setSelectedPin(null)} className="text-on-surface-variant hover:text-on-surface transition-colors p-0.5 ml-0.5">
                    <Icon name="close" className="text-[18px]" />
                  </button>
                </div>
              </div>

              {/* Category */}
              {selectedPin.category && (
                <div className="px-3 pb-1.5">
                  <CategoryBadge category={selectedPin.category} />
                </div>
              )}

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 pb-2">
                {(selectedPin.price_range || selectedPin.price_per_head) && (
                  <span className="font-label-caps text-label-caps text-on-surface-variant">
                    {selectedPin.price_per_head ?? selectedPin.price_range}
                  </span>
                )}
                {(selectedPin.price_range || selectedPin.price_per_head) && selectedAvgRating != null && !selectedPin.photos[0] && (
                  <span className="font-label-caps text-label-caps text-on-surface-variant">·</span>
                )}
                {selectedAvgRating != null && !selectedPin.photos[0] && (
                  <span className="flex items-center gap-0.5 font-label-caps text-label-caps text-on-surface-variant">
                    <Icon name="star" filled className="text-[11px] text-primary" /> {selectedAvgRating}
                  </span>
                )}
              </div>

              {/* Cuisine tags */}
              {selectedPin.cuisine_tags && selectedPin.cuisine_tags.length > 0 && (
                <div className="flex flex-wrap gap-1 px-3 pb-2">
                  {selectedPin.cuisine_tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded-full bg-surface-container font-label-caps text-[9px] text-on-surface-variant">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Find out more */}
              <div className="px-3 pb-2 pt-1">
                <button
                  onClick={() => setDetailPanelOpen(true)}
                  className="w-full py-2 rounded-xl font-label-caps text-label-caps text-primary bg-surface-container hover:bg-primary hover:text-on-primary transition-colors"
                >
                  Find out more →
                </button>
              </div>

              {/* Delete confirmation */}
              {confirmingDeletePin && (
                <div className="px-3 pb-2 flex items-center justify-between">
                  <span className="font-body-sm text-body-sm text-on-surface">Delete this pin?</span>
                  <div className="flex items-center gap-2">
                    {deletePin.isError && <span className="font-body-sm text-body-sm text-red-600">Failed.</span>}
                    <button onClick={() => setConfirmingDeletePin(false)} className="font-label-caps text-label-caps text-secondary hover:text-on-surface uppercase">Cancel</button>
                    <button
                      onClick={() => deletePin.mutate(selectedPin.id)}
                      disabled={deletePin.isPending}
                      className="font-label-caps text-label-caps text-red-600 hover:text-red-700 uppercase disabled:opacity-50"
                    >
                      {deletePin.isPending ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}

              {/* Footer actions */}
              <div className="px-3 pb-3 flex gap-2">
                {(() => {
                  const group = restaurantGroups?.find((g) => g.restaurant_key === selectedPin.restaurant_name.toLowerCase().trim())
                  const count = group?.pins.filter((p) => !hiddenIds.has(p.influencer_id)).length ?? 1
                  return (
                    <button
                      onClick={() => setSpottersPanelOpen(true)}
                      className="flex-1 py-2 rounded-xl font-label-caps text-label-caps text-primary bg-surface-container hover:bg-primary hover:text-on-primary transition-colors text-center"
                    >
                      {count} {count === 1 ? 'spotter' : 'spotters'} →
                    </button>
                  )
                })()}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${selectedPin.lat},${selectedPin.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 py-2 rounded-xl font-label-caps text-label-caps text-on-surface-variant bg-surface-container hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1"
                >
                  <Icon name="directions" className="text-[14px]" />
                  Directions
                </a>
              </div>
            </div>
          )}

          {detailPanelOpen && selectedPin && (
            <aside className="absolute top-0 right-0 h-full w-full md:w-[400px] bg-surface z-40 flex flex-col overflow-y-auto animate-slide-in-right">

              {/* Full-bleed photo hero with floating controls */}
              <div className="relative w-full shrink-0" style={{ height: '42%', minHeight: 200 }}>
                {selectedPin.photos[0] ? (
                  <img
                    src={selectedPin.photos[0]}
                    alt={selectedPin.restaurant_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-surface-container flex items-center justify-center">
                    <span className="font-display-lg text-on-surface-variant italic opacity-20" style={{ fontSize: 64 }}>
                      {selectedPin.restaurant_name[0]}
                    </span>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-surface to-transparent pointer-events-none" />
                <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-4 pb-6 bg-gradient-to-b from-black/50 to-transparent">
                  <button
                    onClick={() => setSelectedPin(null)}
                    className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
                  >
                    <Icon name="arrow_back" className="text-[18px]" />
                  </button>
                  {isOwnPin ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setConfirmingDeletePin(true)}
                        className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-red-600 transition-colors"
                      >
                        <Icon name="delete" className="text-[17px]" />
                      </button>
                      <button
                        onClick={() => setEditingPin(selectedPin)}
                        className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-primary transition-colors"
                      >
                        <Icon name="edit" className="text-[17px]" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSaveToggle(selectedPin.id)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                        savedIds.has(selectedPin.id)
                          ? 'bg-primary text-on-primary'
                          : 'bg-black/40 backdrop-blur-sm text-white hover:bg-primary'
                      }`}
                    >
                      <Icon name="bookmark" filled={savedIds.has(selectedPin.id)} className="text-[18px]" />
                    </button>
                  )}
                </div>
                {selectedAvgRating != null && (
                  <div className="absolute bottom-5 right-4 rounded-lg bg-black/60 backdrop-blur-sm px-2.5 py-1 flex items-center gap-1">
                    <Icon name="star" filled className="text-[13px] text-primary" />
                    <span className="font-label-caps text-label-caps text-white">{selectedAvgRating}</span>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex flex-col flex-1 px-5 pb-24 md:pb-6">
                <div className="flex items-center justify-between gap-2 mb-3 pt-2">
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPin.vibe_tag && (
                      <span className="rounded-full px-3 py-1 font-label-caps text-label-caps text-on-surface-variant bg-surface-container">{selectedPin.vibe_tag.toUpperCase()}</span>
                    )}
                    {(selectedPin.price_per_head || selectedPin.price_range) && (
                      <span className="rounded-full px-3 py-1 font-label-caps text-label-caps text-on-surface-variant bg-surface-container">{selectedPin.price_per_head ?? selectedPin.price_range}</span>
                    )}
                  </div>
                  {(() => {
                    const group = restaurantGroups?.find((g) => g.restaurant_key === selectedPin.restaurant_name.toLowerCase().trim())
                    const count = group?.pins.filter((p) => !hiddenIds.has(p.influencer_id)).length ?? 1
                    return (
                      <button onClick={() => setSpottersPanelOpen(true)} className="shrink-0 rounded-full bg-surface-container px-3 py-1.5 font-label-caps text-label-caps text-primary hover:bg-primary hover:text-on-primary transition-colors">
                        {count} {count === 1 ? 'spotter' : 'spotters'} →
                      </button>
                    )
                  })()}
                </div>

                <h2 className="font-display-lg text-on-surface italic leading-tight mb-2" style={{ fontSize: 28, lineHeight: '34px' }}>
                  {selectedPin.restaurant_name}
                </h2>

                {selectedPin.category && (
                  <div className="mb-4">
                    <CategoryBadge category={selectedPin.category} />
                  </div>
                )}

                {selectedPin.cuisine_tags && selectedPin.cuisine_tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {selectedPin.cuisine_tags.map((tag) => (
                      <span key={tag} className="px-2.5 py-1 rounded-full bg-surface-container font-label-caps text-label-caps text-on-surface-variant">{tag}</span>
                    ))}
                  </div>
                )}

                {(selectedPin.would_return || selectedPin.best_time || selectedPin.best_for?.length) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mb-5">
                    {selectedPin.would_return && (
                      <span className="font-label-caps text-label-caps text-secondary">Would return: <span className="text-on-surface">{selectedPin.would_return}</span></span>
                    )}
                    {selectedPin.best_time && (
                      <span className="font-label-caps text-label-caps text-secondary">Best time: <span className="text-on-surface">{selectedPin.best_time.split(' (')[0]}</span></span>
                    )}
                    {selectedPin.best_for && selectedPin.best_for.length > 0 && (
                      <span className="font-label-caps text-label-caps text-secondary w-full">Best for: <span className="text-on-surface">{selectedPin.best_for.join(', ')}</span></span>
                    )}
                  </div>
                )}

                {selectedPin.reasoning && selectedPin.reasoning.length > 0 && (
                  <div className="flex flex-col gap-2 mb-5">
                    {selectedPin.reasoning.map((r) => (
                      <div key={r} className="flex items-start gap-2.5 rounded-xl bg-surface-container-low px-3.5 py-2.5">
                        <Icon name="star" filled className="text-[11px] text-primary mt-0.5 shrink-0" />
                        <span className="font-body-sm text-body-sm text-on-surface">{r}</span>
                      </div>
                    ))}
                  </div>
                )}

                {(() => {
                  const dishes = selectedPin.must_order_dishes?.filter(Boolean)
                  const legacy = selectedPin.must_order
                  if (dishes && dishes.length > 0) return (
                    <div className="mb-5">
                      <p className="font-label-caps text-label-caps text-secondary uppercase tracking-wider mb-3">Must order</p>
                      <ol className="flex flex-col gap-2">
                        {dishes.map((d, i) => (
                          <li key={i} className="flex items-center gap-3 rounded-xl bg-surface-container-low px-4 py-2.5">
                            <span className="font-label-caps text-label-caps text-primary shrink-0">{i + 1}</span>
                            <span className="font-headline-sm text-headline-sm text-on-surface">{d}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )
                  if (legacy) return (
                    <div className="mb-5">
                      <p className="font-label-caps text-label-caps text-secondary uppercase tracking-wider mb-2">Must order</p>
                      <p className="font-headline-sm text-headline-sm text-primary">{legacy}</p>
                    </div>
                  )
                  return null
                })()}

                {selectedPin.note && (
                  <div className="mb-5 pl-4 border-l-2 border-primary/40">
                    <p className="font-body-base text-body-base text-on-surface leading-relaxed italic">"{selectedPin.note}"</p>
                  </div>
                )}

                {selectedPin.insider_tip && (
                  <div className="bg-surface-container-low rounded-xl px-4 py-3 mb-5">
                    <p className="font-label-caps text-label-caps text-secondary mb-1">INSIDER TIP</p>
                    <p className="font-body-sm text-body-sm text-on-surface italic leading-relaxed">{selectedPin.insider_tip}</p>
                  </div>
                )}

                {confirmingDeletePin && (
                  <div className="rounded-xl bg-red-950/30 px-4 py-3 mb-5 flex flex-col gap-2">
                    <p className="font-body-sm text-body-sm text-on-surface">Delete this pin? This cannot be undone.</p>
                    <div className="flex items-center gap-2">
                      {deletePin.isError && <span className="font-body-sm text-body-sm text-red-400">Failed.</span>}
                      <button onClick={() => setConfirmingDeletePin(false)} className="font-label-caps text-label-caps text-secondary hover:text-on-surface uppercase tracking-wider transition-colors">Cancel</button>
                      <button
                        onClick={() => deletePin.mutate(selectedPin.id)}
                        disabled={deletePin.isPending}
                        className="rounded-full px-3 py-1.5 bg-red-600 text-white font-label-caps text-label-caps uppercase hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        {deletePin.isPending ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-auto pt-4">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${selectedPin.lat},${selectedPin.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3 rounded-xl bg-primary text-on-primary font-label-caps text-label-caps tracking-wider hover:bg-primary-container transition-colors flex items-center justify-center gap-2"
                  >
                    <Icon name="directions" className="text-[18px]" />
                    GET DIRECTIONS
                  </a>
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
                  spotterInfluencers.map(inf => {
                    const rating = spotterGroup?.pins.find((p) => p.influencer_id === inf.id)?.rating
                    return (
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
                        {rating != null && (
                          <div className="shrink-0 ml-4 flex items-center gap-1 rounded-lg bg-surface-container px-2 py-1">
                            <Icon name="star" filled className="text-[14px] text-primary" />
                            <span className="font-label-caps text-label-caps text-on-surface">{rating}</span>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </aside>
          )}
        </main>
      </div>
      <BottomNavBar hidden={sideNavOpen || detailPanelOpen} />

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
