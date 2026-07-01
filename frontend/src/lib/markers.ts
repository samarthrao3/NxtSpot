import type { IconNode } from 'lucide-react'
import { categoryStyle } from './categories'

// Pill map marker: a rounded capsule (influencer colour — amber for multi-curator
// spots) with the category icon on the left and the restaurant rating on the right,
// so the map reads at a glance without tapping.

const NS = 'http://www.w3.org/2000/svg'

// Render a Lucide iconNode (24x24 grid) as an SVG group centred at (cx, cy).
function appendIcon(svg: SVGSVGElement, iconNode: IconNode, cx: number, cy: number, size: number): void {
  const scale = size / 24
  const g = document.createElementNS(NS, 'g')
  g.setAttribute('transform', `translate(${cx - size / 2} ${cy - size / 2}) scale(${scale})`)
  g.setAttribute('fill', 'none')
  g.setAttribute('stroke', '#ffffff')
  g.setAttribute('stroke-width', '2.25')
  g.setAttribute('stroke-linecap', 'round')
  g.setAttribute('stroke-linejoin', 'round')
  g.setAttribute('pointer-events', 'none')
  for (const [tag, attrs] of iconNode) {
    const child = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'key') continue
      child.setAttribute(k, String(v))
    }
    g.appendChild(child)
  }
  svg.appendChild(g)
}

function formatRating(r: number): string {
  return r % 1 === 0 ? String(r) : r.toFixed(1)
}

interface PinMarkerOptions {
  /** Capsule colour — influencer colour, or amber for multi-curator spots. */
  ringColor: string
  category: string | null | undefined
  /** Restaurant rating (single pin) or average rating (multi-curator group). */
  rating?: number | null
}

export function createPinMarkerElement({ ringColor, category, rating }: PinMarkerOptions): HTMLDivElement {
  const { iconNode } = categoryStyle(category)

  const H = 20
  const r = H / 2
  const iconSize = 12
  const fontSize = 11
  const padL = 5
  const gap = 2
  const padR = 6
  const tailW = 4
  const tailH = 5

  const hasRating = rating != null
  const ratingStr = hasRating ? formatRating(rating) : ''
  const ratingW = hasRating ? Math.max(8, ratingStr.length * 6.5) : 0

  const contentW = hasRating ? padL + iconSize + gap + ratingW + padR : padL + iconSize + padR
  // Keep a flat bottom edge wide enough for the tail so the capsule stays a clean pill.
  const W = Math.max(contentW, 2 * r + 2 * tailW + 4)
  const cx = W / 2

  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('width', String(W))
  svg.setAttribute('height', String(H + tailH))
  svg.setAttribute('viewBox', `0 0 ${W} ${H + tailH}`)
  // Subtle neutral shadow so the pin lifts off the map (no coloured glow, no ring).
  svg.style.cssText = 'display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.55));'

  // Capsule + bottom-centre tail as one path so the outline has no seam.
  const body = document.createElementNS(NS, 'path')
  body.setAttribute(
    'd',
    `M ${r} 0 L ${W - r} 0 A ${r} ${r} 0 0 1 ${W - r} ${H} ` +
      `L ${cx + tailW} ${H} L ${cx} ${H + tailH} L ${cx - tailW} ${H} ` +
      `L ${r} ${H} A ${r} ${r} 0 0 1 ${r} 0 Z`,
  )
  body.setAttribute('fill', ringColor)
  svg.appendChild(body)

  const iconCx = hasRating ? padL + iconSize / 2 : cx
  appendIcon(svg, iconNode, iconCx, r, iconSize)

  if (hasRating) {
    const text = document.createElementNS(NS, 'text')
    text.setAttribute('x', String(padL + iconSize + gap))
    text.setAttribute('y', String(r + 0.5))
    text.setAttribute('text-anchor', 'start')
    text.setAttribute('dominant-baseline', 'central')
    text.setAttribute('font-family', 'system-ui,sans-serif')
    text.setAttribute('font-size', String(fontSize))
    text.setAttribute('font-weight', '700')
    text.setAttribute('fill', '#ffffff')
    text.setAttribute('pointer-events', 'none')
    text.textContent = ratingStr
    svg.appendChild(text)
  }

  const el = document.createElement('div')
  el.style.cssText = 'cursor:pointer;'
  el.appendChild(svg)
  return el
}
