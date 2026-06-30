import { useState, useRef, DragEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { mediaApi, pinsApi, type Pin, type PriceRange, type VibeTag } from '@/lib/api'
import { getAppToken } from '@/lib/auth'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'

const PRICE_RANGES: PriceRange[] = ['₹', '₹₹', '₹₹₹']
const CUISINE_TAGS = ['Biryani', 'North Indian', 'South Indian', 'Chinese', 'Continental', 'Street Food', 'Cafe', 'Desserts', 'Seafood', 'Bakery', 'Pizza', 'Beverages', 'Other'] as const
const REASONING_OPTIONS = [
  "Best in Bangalore for this cuisine",
  "Unique dish you can't get elsewhere",
  "Hidden gem off the beaten path",
  "Best value for money in this area",
  "Chef is doing something interesting",
  "Perfect for a special occasion",
  "Nostalgic / comfort food",
  "Undiscovered by most foodies",
] as const
const WOULD_RETURN = ['Absolutely', 'Probably', 'Maybe', 'No'] as const
const BEST_TIME = ['Breakfast (7–11am)', 'Lunch (12–3pm)', 'Evening snacks (4–7pm)', 'Dinner (7–11pm)', 'Late night (11pm+)', 'Any time'] as const
const BEST_FOR = ['Solo dining', 'Date night', 'Group of friends', 'Family with kids', 'Business lunch', 'Quick bite', 'Long lazy meal'] as const
const VIBE_TAGS: VibeTag[] = ['Casual', 'Date Night', 'Hidden Gem', 'Street Food']

interface Props {
  lat: number
  lng: number
  initialName?: string
  pin?: Pin
  onClose: () => void
  onSuccess: () => void
}

function toggleItem<T>(arr: T[], item: T, max: number): T[] {
  if (arr.includes(item)) return arr.filter((x) => x !== item)
  if (arr.length >= max) return arr
  return [...arr, item]
}

export function PinFormModal({ lat, lng, initialName, pin, onClose, onSuccess }: Props) {
  const isEditing = !!pin
  const qc = useQueryClient()

  // step
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // step 1
  const [restaurantName, setRestaurantName] = useState(pin?.restaurant_name ?? initialName ?? '')
  const [photos, setPhotos] = useState<string[]>(pin?.photos ?? [])
  const [priceRange, setPriceRange] = useState<PriceRange | ''>(pin?.price_range ?? '')
  const [cuisineTags, setCuisineTags] = useState<string[]>(pin?.cuisine_tags ?? [])
  const [rating, setRating] = useState<number>(pin?.rating ?? 0)
  const [hoverRating, setHoverRating] = useState(0)
  const [uploadingCount, setUploadingCount] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const dragIndexRef = useRef<number | null>(null)

  // step 2
  const [reasoning, setReasoning] = useState<string[]>(pin?.reasoning ?? [])
  const [mustOrderDishes, setMustOrderDishes] = useState<string[]>(
    pin?.must_order_dishes ?? (pin?.must_order ? [pin.must_order] : [''])
  )
  const [dishCount, setDishCount] = useState(Math.max(1, pin?.must_order_dishes?.length ?? 1))
  const [note, setNote] = useState(pin?.note ?? '')
  const [insiderTip, setInsiderTip] = useState(pin?.insider_tip ?? '')
  const [wouldReturn, setWouldReturn] = useState(pin?.would_return ?? '')

  // step 3
  const [bestTime, setBestTime] = useState(pin?.best_time ?? '')
  const [bestFor, setBestFor] = useState<string[]>(pin?.best_for ?? [])
  const [vibeTag, setVibeTag] = useState<VibeTag | ''>(pin?.vibe_tag ?? '')

  // errors
  const [nameError, setNameError] = useState('')
  const [priceError, setPriceError] = useState('')
  const [ratingError, setRatingError] = useState('')

  const handlePhotoFiles = async (files: FileList) => {
    const remaining = 5 - photos.length
    const toUpload = Array.from(files).slice(0, remaining)
    if (!toUpload.length) return
    setUploadError(null)
    setUploadingCount((c) => c + toUpload.length)
    try {
      const token = await getAppToken()
      const results = await Promise.all(
        toUpload.map(async (file) => {
          const { url, public_url, content_type } = await mediaApi.getPresignedUrl(file.name, token)
          const res = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': content_type } })
          if (!res.ok) throw new Error('Upload failed')
          return public_url
        })
      )
      setPhotos((prev) => [...prev, ...results].slice(0, 5))
    } catch {
      setUploadError('Could not upload one or more photos. Try again.')
    } finally {
      setUploadingCount((c) => c - toUpload.length)
    }
  }

  const removePhoto = (i: number) => setPhotos((prev) => prev.filter((_, idx) => idx !== i))

  const onDragStart = (i: number) => { dragIndexRef.current = i }
  const onDragOver = (e: DragEvent, i: number) => {
    e.preventDefault()
    const from = dragIndexRef.current
    if (from === null || from === i) return
    setPhotos((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(i, 0, item)
      return next
    })
    dragIndexRef.current = i
  }
  const onDragEnd = () => { dragIndexRef.current = null }

  const validateStep1 = () => {
    let ok = true
    if (!restaurantName.trim()) { setNameError('Restaurant name is required'); ok = false } else setNameError('')
    if (!priceRange) { setPriceError('Price range is required'); ok = false } else setPriceError('')
    if (!rating) { setRatingError('Rating is required'); ok = false } else setRatingError('')
    return ok
  }

  const buildPayload = () => ({
    restaurant_name: restaurantName.trim(),
    lat,
    lng,
    photos,
    vibe_tag: vibeTag || null,
    price_range: priceRange || null,
    must_order: null,
    note: note.trim() || null,
    rating: rating || null,
    price_per_head: null,
    cuisine_tags: cuisineTags.length ? cuisineTags : null,
    reasoning: reasoning.length ? reasoning : null,
    must_order_dishes: mustOrderDishes.filter(Boolean).length ? mustOrderDishes.filter(Boolean) : null,
    insider_tip: insiderTip.trim() || null,
    would_return: wouldReturn || null,
    best_time: bestTime || null,
    best_for: bestFor.length ? bestFor : null,
  })

  const submit = useMutation({
    mutationFn: async () => {
      const token = await getAppToken()
      const data = buildPayload()
      return isEditing ? pinsApi.update(pin!.id, data, token) : pinsApi.create(data, token)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pins'] })
      qc.invalidateQueries({ queryKey: ['feed'] })
      onSuccess()
    },
  })

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return
    setStep((s) => (s === 1 ? 2 : 3) as 1 | 2 | 3)
  }
  const handleBack = () => setStep((s) => (s === 3 ? 2 : 1) as 1 | 2 | 3)
  const handlePublishEarly = () => { if (validateStep1()) submit.mutate() }

  const isUploading = uploadingCount > 0
  const canPublish = !isUploading && !submit.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface border border-outline-variant w-full max-w-md max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-outline-variant shrink-0">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            {isEditing ? 'Edit Pin' : 'Add a Pin'}
          </h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <Icon name="close" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 py-3 border-b border-outline-variant shrink-0">
          {([1, 2, 3] as const).map((s) => (
            <div key={s} className="flex items-center gap-3">
              <div
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  s < step ? 'bg-primary' : s === step ? 'bg-primary border-2 border-primary ring-2 ring-primary/20' : 'bg-outline-variant'
                }`}
              />
              {s < 3 && <div className={`w-8 h-px ${s < step ? 'bg-primary' : 'bg-outline-variant'}`} />}
            </div>
          ))}
          <span className="ml-1 font-label-caps text-label-caps text-secondary uppercase">
            Step {step} of 3
          </span>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-4">

          {/* ── STEP 1 ─────────────────────────────────── */}
          {step === 1 && (
            <>
              <label className="flex flex-col gap-1">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Restaurant Name *</span>
                <input
                  type="text"
                  value={restaurantName}
                  onChange={(e) => { setRestaurantName(e.target.value); if (nameError) setNameError('') }}
                  className="border border-outline-variant px-3 py-2 font-body-base text-body-base bg-surface text-on-surface focus:outline-none focus:border-primary"
                  placeholder="e.g. Meghana Foods"
                />
                {nameError && <span className="font-body-sm text-body-sm text-red-600">{nameError}</span>}
              </label>

              {/* Rating */}
              <div className="flex flex-col gap-2">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Your rating *</span>
                <div className="flex gap-1 items-center">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => { setRating(star); if (ratingError) setRatingError('') }}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="transition-colors"
                    >
                      <Icon
                        name="star"
                        filled={(hoverRating || rating) >= star}
                        className={`text-[28px] ${(hoverRating || rating) >= star ? 'text-primary' : 'text-outline-variant'}`}
                      />
                    </button>
                  ))}
                  {rating > 0 && (
                    <span className="ml-2 font-headline-sm text-headline-sm text-on-surface">{rating}.0</span>
                  )}
                </div>
                {ratingError && <span className="font-body-sm text-body-sm text-red-600">{ratingError}</span>}
              </div>

              {/* Photos */}
              <div className="flex flex-col gap-2">
                <span className="font-label-caps text-label-caps text-on-surface-variant">
                  Photos <span className="normal-case text-secondary">(up to 5 · drag to reorder · first is cover)</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {photos.map((url, i) => (
                    <div
                      key={url}
                      draggable
                      onDragStart={() => onDragStart(i)}
                      onDragOver={(e) => onDragOver(e, i)}
                      onDragEnd={onDragEnd}
                      className="relative w-20 h-20 border border-outline-variant cursor-grab active:cursor-grabbing group"
                    >
                      <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                      {i === 0 && (
                        <span className="absolute bottom-0 left-0 right-0 bg-primary/80 text-white text-[9px] font-bold text-center py-0.5">
                          COVER
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px]"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {photos.length < 5 && (
                    <label className="w-20 h-20 border border-dashed border-outline-variant flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors bg-surface-container-low">
                      {isUploading ? (
                        <Spinner size={5} />
                      ) : (
                        <>
                          <Icon name="add_photo_alternate" className="text-on-surface-variant text-[22px]" />
                          <span className="font-label-caps text-[9px] text-secondary mt-0.5">ADD</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic"
                        multiple
                        className="sr-only"
                        onChange={(e) => { if (e.target.files) handlePhotoFiles(e.target.files) }}
                      />
                    </label>
                  )}
                </div>
                {uploadError && <span className="font-body-sm text-body-sm text-red-600">{uploadError}</span>}
              </div>

              {/* Price range */}
              <div className="flex flex-col gap-2">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Price *</span>
                <div className="flex gap-2">
                  {PRICE_RANGES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { setPriceRange(p); if (priceError) setPriceError('') }}
                      className={`px-4 py-1.5 border font-label-caps text-label-caps transition-colors ${
                        priceRange === p
                          ? 'border-primary bg-primary text-on-primary'
                          : 'border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                {priceError && <span className="font-body-sm text-body-sm text-red-600">{priceError}</span>}
              </div>

              {/* Cuisine tags */}
              <div className="flex flex-col gap-2">
                <span className="font-label-caps text-label-caps text-on-surface-variant">
                  Cuisine tags <span className="normal-case text-secondary">(pick 1–3)</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {CUISINE_TAGS.map((tag) => {
                    const selected = cuisineTags.includes(tag)
                    const maxed = cuisineTags.length >= 3 && !selected
                    return (
                      <button
                        key={tag}
                        type="button"
                        disabled={maxed}
                        onClick={() => setCuisineTags(toggleItem(cuisineTags, tag, 3))}
                        className={`px-3 py-1.5 border font-label-caps text-label-caps transition-colors ${
                          selected
                            ? 'border-primary bg-primary text-on-primary'
                            : maxed
                            ? 'border-outline-variant text-outline-variant cursor-not-allowed'
                            : 'border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
                        }`}
                      >
                        {tag}
                      </button>
                    )
                  })}
                </div>
              </div>

            </>
          )}

          {/* ── STEP 2 ─────────────────────────────────── */}
          {step === 2 && (
            <>
              {/* Spotter's Reasoning */}
              <div className="flex flex-col gap-2">
                <span className="font-label-caps text-label-caps text-on-surface-variant">
                  Why are you recommending this? <span className="normal-case text-secondary">(pick 1–3)</span>
                </span>
                <div className="flex flex-col gap-2">
                  {REASONING_OPTIONS.map((r) => {
                    const checked = reasoning.includes(r)
                    const maxed = reasoning.length >= 3 && !checked
                    return (
                      <label key={r} className={`flex items-center gap-3 cursor-pointer ${maxed ? 'opacity-40' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={maxed}
                          onChange={() => setReasoning(toggleItem(reasoning, r, 3))}
                          className="w-4 h-4 accent-primary"
                        />
                        <span className="font-body-sm text-body-sm text-on-surface">{r}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Must-order dishes */}
              <div className="flex flex-col gap-2">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Must-order dishes</span>
                {Array.from({ length: dishCount }).map((_, i) => (
                  <input
                    key={i}
                    type="text"
                    placeholder={`Dish ${i + 1}`}
                    value={mustOrderDishes[i] ?? ''}
                    onChange={(e) => {
                      const updated = [...mustOrderDishes]
                      updated[i] = e.target.value
                      setMustOrderDishes(updated)
                    }}
                    className="border border-outline-variant px-3 py-2 font-body-base text-body-base bg-surface text-on-surface focus:outline-none focus:border-primary"
                  />
                ))}
                {dishCount < 3 && (
                  <button
                    type="button"
                    onClick={() => setDishCount((c) => Math.min(3, c + 1) as 1 | 2 | 3)}
                    className="self-start font-label-caps text-label-caps text-primary hover:text-primary/70 transition-colors"
                  >
                    + Add another dish
                  </button>
                )}
              </div>

              {/* Note */}
              <label className="flex flex-col gap-1">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Your note</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 280))}
                  rows={3}
                  placeholder="What makes this place worth visiting?"
                  className="border border-outline-variant px-3 py-2 font-body-base text-body-base bg-surface text-on-surface resize-none focus:outline-none focus:border-primary"
                />
                <span className={`font-label-caps text-label-caps self-end ${note.length >= 260 ? 'text-red-500' : 'text-secondary'}`}>
                  {note.length}/280
                </span>
              </label>

              {/* Insider tip */}
              <label className="flex flex-col gap-1">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Insider tip</span>
                <textarea
                  value={insiderTip}
                  onChange={(e) => setInsiderTip(e.target.value.slice(0, 200))}
                  rows={2}
                  placeholder="The secret menu item, which table to ask for, when to avoid the queue…"
                  className="border border-outline-variant px-3 py-2 font-body-base text-body-base bg-surface text-on-surface resize-none focus:outline-none focus:border-primary"
                />
                <span className={`font-label-caps text-label-caps self-end ${insiderTip.length >= 180 ? 'text-red-500' : 'text-secondary'}`}>
                  {insiderTip.length}/200
                </span>
              </label>

              {/* Would you return */}
              <div className="flex flex-col gap-2">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Would you return?</span>
                <div className="flex flex-wrap gap-2">
                  {WOULD_RETURN.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWouldReturn(wouldReturn === w ? '' : w)}
                      className={`px-3 py-1.5 border font-label-caps text-label-caps transition-colors ${
                        wouldReturn === w
                          ? 'border-primary bg-primary text-on-primary'
                          : 'border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── STEP 3 ─────────────────────────────────── */}
          {step === 3 && (
            <>
              {/* Best time */}
              <div className="flex flex-col gap-2">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Best time to visit</span>
                <div className="flex flex-col gap-2">
                  {BEST_TIME.map((t) => (
                    <label key={t} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="best_time"
                        checked={bestTime === t}
                        onChange={() => setBestTime(t)}
                        className="accent-primary"
                      />
                      <span className="font-body-sm text-body-sm text-on-surface">{t}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Best for */}
              <div className="flex flex-col gap-2">
                <span className="font-label-caps text-label-caps text-on-surface-variant">
                  Best for <span className="normal-case text-secondary">(up to 3)</span>
                </span>
                <div className="flex flex-col gap-2">
                  {BEST_FOR.map((b) => {
                    const checked = bestFor.includes(b)
                    const maxed = bestFor.length >= 3 && !checked
                    return (
                      <label key={b} className={`flex items-center gap-3 cursor-pointer ${maxed ? 'opacity-40' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={maxed}
                          onChange={() => setBestFor(toggleItem(bestFor, b, 3))}
                          className="w-4 h-4 accent-primary"
                        />
                        <span className="font-body-sm text-body-sm text-on-surface">{b}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Vibe tag */}
              <div className="flex flex-col gap-2">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Vibe</span>
                <div className="flex flex-wrap gap-2">
                  {VIBE_TAGS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVibeTag(vibeTag === v ? '' : v)}
                      className={`px-3 py-1.5 border font-label-caps text-label-caps transition-colors ${
                        vibeTag === v
                          ? 'border-primary bg-primary text-on-primary'
                          : 'border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {submit.isError && (
            <p className="font-body-sm text-body-sm text-red-600">
              {submit.error instanceof Error ? submit.error.message : 'Could not save pin.'}
            </p>
          )}
        </div>

        {/* Footer buttons */}
        <div className="border-t border-outline-variant px-4 py-3 flex flex-col gap-2 shrink-0">
          <div className="flex gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2.5 border border-outline-variant font-label-caps text-label-caps text-on-surface hover:bg-surface-container-low transition-colors"
              >
                Back
              </button>
            )}

            {step < 3 && (
              <button
                type="button"
                onClick={handleNext}
                className="flex-1 py-2.5 bg-[#1A1A1A] text-white font-label-caps text-label-caps tracking-wider hover:bg-[#333333] transition-colors"
              >
                Next →
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-4 py-2.5 border border-outline-variant font-label-caps text-label-caps text-secondary hover:text-on-surface transition-colors"
              >
                Skip
              </button>
            )}

            {step === 3 && (
              <>
                <button
                  type="button"
                  onClick={() => submit.mutate()}
                  disabled={!canPublish}
                  className="flex-1 py-2.5 bg-[#1A1A1A] text-white font-label-caps text-label-caps tracking-wider hover:bg-[#333333] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submit.isPending ? <><Spinner size={4} /> Publishing…</> : 'Publish'}
                </button>
                <button
                  type="button"
                  onClick={() => submit.mutate()}
                  disabled={!canPublish}
                  className="px-4 py-2.5 border border-outline-variant font-label-caps text-label-caps text-secondary hover:text-on-surface transition-colors disabled:opacity-50"
                >
                  Skip &amp; Publish
                </button>
              </>
            )}
          </div>

          {step === 1 && (
            <button
              type="button"
              onClick={handlePublishEarly}
              disabled={!canPublish}
              className="w-full py-2 border border-outline-variant font-label-caps text-label-caps text-secondary hover:text-on-surface transition-colors disabled:opacity-50"
            >
              {submit.isPending ? 'Publishing…' : 'Publish (add details later)'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
