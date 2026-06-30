import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
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
  const [hasTappedPin, setHasTappedPin] = useState(false)
  const [editingPin, setEditingPin] = useState<Pin | null>(null)
  const [confirmingDeletePin, setConfirmingDeletePin] = useState(false)
  const [spottersPanelOpen, setSpottersPanelOpen] = useState(false)
  const [spottersClosing, setSpottersClosing] = useState(false)
  const [pinPixelPos, setPinPixelPos] = useState<{ x: number; y: number } | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)

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
    map.current?.on('move', update)
    return () => { map.current?.off('move', update) }
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
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: BANGALORE_CENTER,
      zoom: BANGALORE_DEFAULT_ZOOM,
      maxBounds: BANGALORE_MAX_BOUNDS,
      antialias: false,
      dragRotate: false,
      touchPitch: false,
      fadeDuration: 0,
    })
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
          // Single: solid influencer color + colored glow (lantern on dark map). Multi: solid amber + amber glow.
          const AMBER = '#ffc174'
          const AMBER_DARK = '#472a00'
          const pinColor = colorForId(primary.influencer_id)
          const pr = parseInt(pinColor.slice(1, 3), 16)
          const pg = parseInt(pinColor.slice(3, 5), 16)
          const pb = parseInt(pinColor.slice(5, 7), 16)
          const pinGlow = `rgba(${pr},${pg},${pb},0.55)`
          const pinW = isMulti ? 32 : 26
          const pinH = isMulti ? 42 : 34
          const ns = 'http://www.w3.org/2000/svg'
          const svg = document.createElementNS(ns, 'svg')
          svg.setAttribute('width', String(pinW))
          svg.setAttribute('height', String(pinH))
          svg.setAttribute('viewBox', `0 0 ${pinW} ${pinH}`)
          svg.style.cssText = isMulti
            ? 'display:block;filter:drop-shadow(0 2px 10px rgba(255,193,116,0.45));'
            : `display:block;filter:drop-shadow(0 2px 10px ${pinGlow});`
          const pathEl = document.createElementNS(ns, 'path')
          pathEl.setAttribute('d', isMulti
            ? 'M16,2 C8.27,2 2,8.27 2,16 C2,26.75 16,42 16,42 C16,42 30,26.75 30,16 C30,8.27 23.73,2 16,2 Z'
            : 'M13,2 C7.48,2 3,6.48 3,12 C3,20.5 13,34 13,34 C13,34 23,20.5 23,12 C23,6.48 18.52,2 13,2 Z')
          if (isMulti) {
            pathEl.setAttribute('fill', AMBER)
            pathEl.setAttribute('stroke', AMBER_DARK)
            pathEl.setAttribute('stroke-width', '1.5')
          } else {
            pathEl.setAttribute('fill', pinColor)
            pathEl.setAttribute('stroke', 'rgba(255,255,255,0.7)')
            pathEl.setAttribute('stroke-width', '1.5')
          }
          svg.appendChild(pathEl)
          const ratedPins = visiblePins.filter((p) => p.rating != null)
          const avgRating = ratedPins.length > 0
            ? ratedPins.reduce((sum, p) => sum + p.rating!, 0) / ratedPins.length
            : null
          const formatRating = (r: number) => r % 1 === 0 ? String(r) : r.toFixed(1)

          if (isMulti) {
            const t = document.createElementNS(ns, 'text')
            t.setAttribute('x', '16')
            t.setAttribute('y', '16')
            t.setAttribute('text-anchor', 'middle')
            t.setAttribute('dominant-baseline', 'central')
            t.setAttribute('font-family', 'system-ui,sans-serif')
            t.setAttribute('font-size', '8.5')
            t.setAttribute('font-weight', '700')
            t.setAttribute('fill', AMBER_DARK)
            t.setAttribute('pointer-events', 'none')
            t.textContent = avgRating != null ? '★' + formatRating(avgRating) : '★'
            svg.appendChild(t)
          } else {
            if (primary.rating != null) {
              const t = document.createElementNS(ns, 'text')
              t.setAttribute('x', '13')
              t.setAttribute('y', '12')
              t.setAttribute('text-anchor', 'middle')
              t.setAttribute('dominant-baseline', 'central')
              t.setAttribute('font-family', 'system-ui,sans-serif')
              t.setAttribute('font-size', '8')
              t.setAttribute('font-weight', '700')
              t.setAttribute('fill', 'white')
              t.setAttribute('pointer-events', 'none')
              t.textContent = formatRating(primary.rating)
              svg.appendChild(t)
            } else {
              const dot = document.createElementNS(ns, 'circle')
              dot.setAttribute('cx', '13')
              dot.setAttribute('cy', '12')
              dot.setAttribute('r', '4')
              dot.setAttribute('fill', 'white')
              dot.setAttribute('fill-opacity', '0.9')
              dot.setAttribute('pointer-events', 'none')
              svg.appendChild(dot)
            }
          }
          const el = document.createElement('div')
          el.style.cssText = 'cursor:pointer;'
          el.appendChild(svg)

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
            offset: [0, -pinH] as [number, number],
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

      // Influencer's own pins — not in the feed (self-follow is blocked by the backend)
      ownPins?.forEach((pin) => {
        if (hiddenIds.has(pin.influencer_id)) return
        const ownColor = colorForId(pin.influencer_id)
        const or = parseInt(ownColor.slice(1, 3), 16)
        const og = parseInt(ownColor.slice(3, 5), 16)
        const ob = parseInt(ownColor.slice(5, 7), 16)
        const ownGlow = `rgba(${or},${og},${ob},0.55)`
        const sns = 'http://www.w3.org/2000/svg'
        const ownSvg = document.createElementNS(sns, 'svg')
        ownSvg.setAttribute('width', '26')
        ownSvg.setAttribute('height', '34')
        ownSvg.setAttribute('viewBox', '0 0 26 34')
        ownSvg.style.cssText = `display:block;filter:drop-shadow(0 2px 10px ${ownGlow});`
        const ownPath = document.createElementNS(sns, 'path')
        ownPath.setAttribute('d', 'M13,2 C7.48,2 3,6.48 3,12 C3,20.5 13,34 13,34 C13,34 23,20.5 23,12 C23,6.48 18.52,2 13,2 Z')
        ownPath.setAttribute('fill', ownColor)
        ownPath.setAttribute('stroke', 'rgba(255,255,255,0.7)')
        ownPath.setAttribute('stroke-width', '1.5')
        ownSvg.appendChild(ownPath)
        if (pin.rating != null) {
          const ownT = document.createElementNS(sns, 'text')
          ownT.setAttribute('x', '13')
          ownT.setAttribute('y', '12')
          ownT.setAttribute('text-anchor', 'middle')
          ownT.setAttribute('dominant-baseline', 'central')
          ownT.setAttribute('font-family', 'system-ui,sans-serif')
          ownT.setAttribute('font-size', '8')
          ownT.setAttribute('font-weight', '700')
          ownT.setAttribute('fill', 'white')
          ownT.setAttribute('pointer-events', 'none')
          ownT.textContent = pin.rating % 1 === 0 ? String(pin.rating) : pin.rating.toFixed(1)
          ownSvg.appendChild(ownT)
        } else {
          const ownDot = document.createElementNS(sns, 'circle')
          ownDot.setAttribute('cx', '13')
          ownDot.setAttribute('cy', '12')
          ownDot.setAttribute('r', '4')
          ownDot.setAttribute('fill', 'white')
          ownDot.setAttribute('fill-opacity', '0.9')
          ownDot.setAttribute('pointer-events', 'none')
          ownSvg.appendChild(ownDot)
        }
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
          pinOpen={mapMoving || detailPanelOpen}
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

          {selectedPin && pinPixelPos && !detailPanelOpen && (
            <div
              className="absolute z-40 w-[280px] rounded-2xl overflow-hidden shadow-2xl"
              style={{
                left: pinPixelPos.x,
                top: pinPixelPos.y,
                transform: 'translate(-50%, calc(-100% - 44px))',
                background: 'rgba(28,27,27,0.95)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
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

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 pb-2">
                {(selectedPin.price_range || selectedPin.price_per_head) && (
                  <span className="font-label-caps text-label-caps text-on-surface-variant">
                    {selectedPin.price_per_head ?? selectedPin.price_range}
                  </span>
                )}
                {selectedPin.vibe_tag && (
                  <span className="font-label-caps text-label-caps text-on-surface-variant">· {selectedPin.vibe_tag}</span>
                )}
                {selectedAvgRating != null && !selectedPin.photos[0] && (
                  <span className="flex items-center gap-0.5 font-label-caps text-label-caps text-on-surface-variant">
                    · <Icon name="star" filled className="text-[11px] text-primary" /> {selectedAvgRating}
                  </span>
                )}
                {selectedPin.would_return && (
                  <span className="font-label-caps text-label-caps text-secondary">· Returns: {selectedPin.would_return}</span>
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

                <h2 className="font-display-lg text-on-surface italic leading-tight mb-4" style={{ fontSize: 28, lineHeight: '34px' }}>
                  {selectedPin.restaurant_name}
                </h2>

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
