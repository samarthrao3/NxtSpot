export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string

export const BANGALORE_BBOX = {
  lat: { min: 12.834, max: 13.139 },
  lng: { min: 77.469, max: 77.752 },
} as const

export const BANGALORE_MAX_BOUNDS: [[number, number], [number, number]] = [
  [77.35, 12.75],
  [77.85, 13.25],
]

export const BANGALORE_CENTER: [number, number] = [77.5946, 12.9716]
export const BANGALORE_DEFAULT_ZOOM = 12

// Dark theme uses the new Standard style (supports the `basemap` night preset);
// light theme uses Streets v12. See mapStyleFor().
export const MAP_STYLE_DARK = 'mapbox://styles/mapbox/standard'
export const MAP_STYLE_LIGHT = 'mapbox://styles/mapbox/streets-v12'
export const MAP_STYLE = MAP_STYLE_DARK

export const mapStyleFor = (theme: 'dark' | 'light') =>
  theme === 'light' ? MAP_STYLE_LIGHT : MAP_STYLE_DARK
