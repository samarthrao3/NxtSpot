const GOOGLE_PLACES_API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined

let loadPromise: Promise<typeof google> | null = null

// Injects the Google Maps JS script (places library only) once and resolves
// with the `google` global. Safe to call from multiple components — the
// script tag and its load promise are shared across all callers.
export function loadGooglePlaces(): Promise<typeof google> {
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('loadGooglePlaces called outside the browser'))
      return
    }
    if (window.google?.maps?.places) {
      resolve(window.google)
      return
    }
    if (!GOOGLE_PLACES_API_KEY) {
      reject(new Error('VITE_GOOGLE_PLACES_API_KEY is not set'))
      return
    }

    const callbackName = '__nxtspotGooglePlacesLoaded'
    ;(window as unknown as Record<string, () => void>)[callbackName] = () => {
      resolve(window.google)
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_PLACES_API_KEY)}&libraries=places&loading=async&callback=${callbackName}`
    script.async = true
    script.onerror = () => reject(new Error('Failed to load Google Maps JS API'))
    document.head.appendChild(script)
  })

  return loadPromise
}
