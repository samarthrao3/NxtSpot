import type { IconNode } from 'lucide-react'

// Single source of truth for place categories — shared by the pin form,
// map markers (inner colour + icon) and the pin drawers.
//
// Each category carries a Lucide `iconNode` (the raw [tag, attrs] node array)
// rather than a component, so the same data drives both React (via lucide-react's
// generic <Icon iconNode={...} />) and the imperative SVG map markers.

export const CATEGORIES = [
  'Restaurant',
  'Cafe',
  'Pub/Bar',
  'Street Food',
  'Bakery/Desserts',
  'Fine Dining',
  'Food Truck',
  'Cloud Kitchen',
] as const

export type CategoryType = (typeof CATEGORIES)[number]

export interface CategoryStyle {
  label: string
  color: string
  iconNode: IconNode
}

// Lucide icon node arrays (lucide-react v1.22.0, ISC licensed).
const UTENSILS: IconNode = [
  ['path', { d: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2', key: 'cjf0a3' }],
  ['path', { d: 'M7 2v20', key: '1473qp' }],
  ['path', { d: 'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7', key: 'j28e5' }],
]
const COFFEE: IconNode = [
  ['path', { d: 'M10 2v2', key: '7u0qdc' }],
  ['path', { d: 'M14 2v2', key: '6buw04' }],
  ['path', { d: 'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1', key: 'pwadti' }],
  ['path', { d: 'M6 2v2', key: 'colzsn' }],
]
const BEER: IconNode = [
  ['path', { d: 'M17 11h1a3 3 0 0 1 0 6h-1', key: '1yp76v' }],
  ['path', { d: 'M9 12v6', key: '1u1cab' }],
  ['path', { d: 'M13 12v6', key: '1sugkk' }],
  ['path', { d: 'M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z', key: '1510fo' }],
  ['path', { d: 'M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8', key: '19jb7n' }],
]
const SANDWICH: IconNode = [
  ['path', { d: 'm2.37 11.223 8.372-6.777a2 2 0 0 1 2.516 0l8.371 6.777', key: 'f1wd0e' }],
  ['path', { d: 'M21 15a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5.25', key: '1pfu07' }],
  ['path', { d: 'M3 15a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h9', key: '1oq9qw' }],
  ['path', { d: 'm6.67 15 6.13 4.6a2 2 0 0 0 2.8-.4l3.15-4.2', key: '1fnwu5' }],
  ['rect', { width: '20', height: '4', x: '2', y: '11', rx: '1', key: 'itshg' }],
]
const CAKE_SLICE: IconNode = [
  ['path', { d: 'M16 13H3', key: '1wpj08' }],
  ['path', { d: 'M16 17H3', key: '3lvfcd' }],
  ['path', { d: 'm7.2 7.9-3.388 2.5A2 2 0 0 0 3 12.01V20a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-8.654c0-2-2.44-6.026-6.44-8.026a1 1 0 0 0-1.082.057L10.4 5.6', key: '1gmhf7' }],
  ['circle', { cx: '9', cy: '7', r: '2', key: '1305pl' }],
]
const WINE: IconNode = [
  ['path', { d: 'M8 22h8', key: 'rmew8v' }],
  ['path', { d: 'M7 10h10', key: '1101jm' }],
  ['path', { d: 'M12 15v7', key: 't2xh3l' }],
  ['path', { d: 'M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z', key: '10ffi3' }],
]
const TRUCK: IconNode = [
  ['path', { d: 'M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2', key: 'wrbu53' }],
  ['path', { d: 'M15 18H9', key: '1lyqi6' }],
  ['path', { d: 'M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14', key: 'lysw3i' }],
  ['circle', { cx: '17', cy: '18', r: '2', key: '332jqn' }],
  ['circle', { cx: '7', cy: '18', r: '2', key: '19iecd' }],
]
const CHEF_HAT: IconNode = [
  ['path', { d: 'M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z', key: '1qvrer' }],
  ['path', { d: 'M6 17h12', key: '1jwigz' }],
]

const CATEGORY_STYLES: Record<CategoryType, CategoryStyle> = {
  'Restaurant': { label: 'Restaurant', color: '#E05A3B', iconNode: UTENSILS },
  'Cafe': { label: 'Cafe', color: '#A9743B', iconNode: COFFEE },
  'Pub/Bar': { label: 'Pub / Bar', color: '#9A5BB8', iconNode: BEER },
  'Street Food': { label: 'Street Food', color: '#E0A81E', iconNode: SANDWICH },
  'Bakery/Desserts': { label: 'Bakery & Desserts', color: '#E06B96', iconNode: CAKE_SLICE },
  'Fine Dining': { label: 'Fine Dining', color: '#2E8B94', iconNode: WINE },
  'Food Truck': { label: 'Food Truck', color: '#3E9A5C', iconNode: TRUCK },
  'Cloud Kitchen': { label: 'Cloud Kitchen', color: '#5566C0', iconNode: CHEF_HAT },
}

// Fallback for pins created before categories existed (category === null).
const DEFAULT_STYLE: CategoryStyle = {
  label: 'Spot',
  color: '#6B7280',
  iconNode: [['path', { d: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0', key: '1r0f0z' }], ['circle', { cx: '12', cy: '10', r: '3', key: 'ilqhr7' }]],
}

export function categoryStyle(category: string | null | undefined): CategoryStyle {
  if (category && category in CATEGORY_STYLES) {
    return CATEGORY_STYLES[category as CategoryType]
  }
  return DEFAULT_STYLE
}
