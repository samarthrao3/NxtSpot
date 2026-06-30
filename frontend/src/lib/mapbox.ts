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

export const MAP_STYLE = 'mapbox://styles/mapbox/standard'
