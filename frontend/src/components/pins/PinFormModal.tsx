import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { mediaApi, pinsApi, type PriceRange, type VibeTag } from '@/lib/api'
import { getAppToken } from '@/lib/auth'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'

const VIBE_TAGS: VibeTag[] = ['Casual', 'Date Night', 'Hidden Gem', 'Street Food']
const PRICE_RANGES: PriceRange[] = ['₹', '₹₹', '₹₹₹']

interface Props {
  lat: number
  lng: number
  initialName?: string
  onClose: () => void
  onSuccess: () => void
}

export function PinFormModal({ lat, lng, initialName, onClose, onSuccess }: Props) {
  const qc = useQueryClient()
  const [restaurantName, setRestaurantName] = useState(initialName ?? '')
  const [vibeTag, setVibeTag] = useState<VibeTag | ''>('')
  const [priceRange, setPriceRange] = useState<PriceRange | ''>('')
  const [mustOrder, setMustOrder] = useState('')
  const [note, setNote] = useState('')
  const [rating, setRating] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handlePhotoSelect = async (file: File) => {
    setUploading(true)
    setUploadError(null)
    try {
      const token = await getAppToken()
      const { url, public_url, content_type } = await mediaApi.getPresignedUrl(file.name, token)
      const res = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': content_type } })
      if (!res.ok) throw new Error('Upload failed')
      setPhotoUrl(public_url)
    } catch {
      setUploadError('Could not upload photo. Try again.')
    } finally {
      setUploading(false)
    }
  }

  const create = useMutation({
    mutationFn: async () => {
      const token = await getAppToken()
      return pinsApi.create(
        {
          restaurant_name: restaurantName,
          lat,
          lng,
          photos: photoUrl ? [photoUrl] : [],
          vibe_tag: vibeTag || null,
          price_range: priceRange || null,
          must_order: mustOrder || null,
          note: note || null,
          rating: rating ? Number(rating) : null,
        },
        token,
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pins'] })
      onSuccess()
    },
  })

  const canSubmit = restaurantName.trim().length > 0 && !uploading && !create.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-surface border border-outline-variant w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-surface z-10 flex justify-between items-center p-4 border-b border-outline-variant">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Add a Pin</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <Icon name="close" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
          className="p-4 flex flex-col gap-4"
        >
          <p className="font-body-sm text-body-sm text-secondary">
            Location: {lat.toFixed(4)}, {lng.toFixed(4)}
          </p>

          <label className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Restaurant Name *</span>
            <input
              type="text"
              required
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              className="border border-outline-variant px-3 py-2 font-body-base text-body-base bg-surface text-on-surface"
            />
          </label>

          <div className="flex gap-4">
            <label className="flex flex-col gap-1 flex-1">
              <span className="font-label-caps text-label-caps text-on-surface-variant">Vibe</span>
              <select
                value={vibeTag}
                onChange={(e) => setVibeTag(e.target.value as VibeTag | '')}
                className="border border-outline-variant px-3 py-2 font-body-base text-body-base bg-surface text-on-surface"
              >
                <option value="">—</option>
                {VIBE_TAGS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 flex-1">
              <span className="font-label-caps text-label-caps text-on-surface-variant">Price</span>
              <select
                value={priceRange}
                onChange={(e) => setPriceRange(e.target.value as PriceRange | '')}
                className="border border-outline-variant px-3 py-2 font-body-base text-body-base bg-surface text-on-surface"
              >
                <option value="">—</option>
                {PRICE_RANGES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Must Order</span>
            <input
              type="text"
              value={mustOrder}
              onChange={(e) => setMustOrder(e.target.value)}
              className="border border-outline-variant px-3 py-2 font-body-base text-body-base bg-surface text-on-surface"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Note</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="border border-outline-variant px-3 py-2 font-body-base text-body-base bg-surface text-on-surface resize-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Rating (1–5)</span>
            <input
              type="number"
              min={1}
              max={5}
              step={0.5}
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              className="border border-outline-variant px-3 py-2 font-body-base text-body-base bg-surface text-on-surface"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Photo</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handlePhotoSelect(file)
              }}
              className="font-body-sm text-body-sm text-on-surface-variant"
            />
            {uploading && (
              <span className="flex items-center gap-2 font-body-sm text-body-sm text-secondary">
                <Spinner size={4} /> Uploading…
              </span>
            )}
            {uploadError && <span className="font-body-sm text-body-sm text-red-600">{uploadError}</span>}
            {photoUrl && !uploading && (
              <img src={photoUrl} alt="Preview" className="w-24 h-24 object-cover border border-outline-variant mt-1" />
            )}
          </label>

          {create.isError && (
            <p className="font-body-sm text-body-sm text-red-600">
              {create.error instanceof Error ? create.error.message : 'Could not create pin.'}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-3 bg-[#1A1A1A] text-white font-label-caps text-label-caps tracking-wider hover:bg-[#333333] transition-colors border border-[#1A1A1A] disabled:opacity-50"
          >
            {create.isPending ? 'Saving…' : 'Save Pin'}
          </button>
        </form>
      </div>
    </div>
  )
}
