import { useEffect, useRef, useState } from 'react'
import { loadGooglePlaces } from '@/lib/googlePlaces'
import { BANGALORE_BBOX } from '@/lib/mapbox'
import { Icon } from '@/components/ui/Icon'

interface Props {
  placeholder?: string
  onSelect: (lat: number, lng: number, name?: string) => void
}

// Google Places Autocomplete bound to a plain input, styled to match the app.
// Mapbox's own geocoder (formerly @mapbox/search-js-react here) has noticeably
// thinner/staler POI data for small local restaurants than Google Places, which
// is exactly what this search is used to find — the map itself still renders
// via Mapbox GL JS, only the location search provider changed.
export function LocationSearchBox({ placeholder = 'Search for a location in Bangalore', onSelect }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    loadGooglePlaces()
      .then((g) => {
        if (cancelled || !inputRef.current) return
        const bounds = new g.maps.LatLngBounds(
          { lat: BANGALORE_BBOX.lat.min, lng: BANGALORE_BBOX.lng.min },
          { lat: BANGALORE_BBOX.lat.max, lng: BANGALORE_BBOX.lng.max },
        )
        const autocomplete = new g.maps.places.Autocomplete(inputRef.current, {
          bounds,
          strictBounds: true,
          componentRestrictions: { country: 'in' },
          fields: ['geometry', 'name'],
        })
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace()
          const location = place.geometry?.location
          if (!location) return
          onSelectRef.current(location.lat(), location.lng(), place.name)
        })
        autocompleteRef.current = autocomplete
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load search')
      })

    return () => {
      cancelled = true
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current)
        autocompleteRef.current = null
      }
    }
  }, [])

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 rounded-full bg-surface-container-low/95 backdrop-blur-sm border border-outline-variant shadow-lg pl-4 pr-3 py-2.5 transition-colors focus-within:border-primary">
        <Icon name="search" className="text-on-surface-variant text-[18px] shrink-0" />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent font-body-base text-body-base text-on-surface placeholder:text-secondary focus:outline-none"
        />
      </div>
      {error && (
        <p className="px-3 font-body-sm text-body-sm text-red-400 bg-surface-container-low/95 backdrop-blur-sm rounded-lg py-1.5 shadow-lg">
          {error}
        </p>
      )}
    </div>
  )
}
