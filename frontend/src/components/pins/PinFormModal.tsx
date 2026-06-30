import { useState, useRef, DragEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { mediaApi, pinsApi, type Pin, type PriceRange, type VibeTag } from '@/lib/api'
import { getAppToken } from '@/lib/auth'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'

const PRICE_RANGES: PriceRange[] = ['₹', '₹₹', '₹₹₹']
const CUISINE_TAGS = ['Biryani', 'North Indian', 'South Indian', 'Chinese', 'Continental', 'Street Food', 'Cafe', 'Desserts', 'Seafood', 'Bakery', 'Pizza', 'Beverages'] as const
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

// Shared class builders
const pillBase = 'font-label-caps text-label-caps transition-colors rounded-full px-4 py-2'
const pillActive = 'bg-primary text-on-primary'
const pillInactive = 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
const pillDisabled = 'bg-surface-container text-secondary cursor-not-allowed opacity-50'

const blockBase = 'font-body-sm text-body-sm transition-colors rounded-xl px-4 py-2.5 text-left'
const blockActive = 'bg-primary text-on-primary'
const blockInactive = 'bg-surface-container text-on-surface hover:bg-surface-container-high'

const inputClass = 'rounded-xl bg-surface-container px-3 py-2.5 font-body-base text-body-base text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full'
const textareaClass = 'rounded-xl bg-surface-container px-3 py-2.5 font-body-base text-body-base text-on-surface resize-none focus:outline-none focus:ring-1 focus:ring-primary w-full'

export function PinFormModal({ lat, lng, initialName, pin, onClose, onSuccess }: Props) {
  const isEditing = !!pin
  const qc = useQueryClient()

  const [step, setStep] = useState<1 | 2 | 3>(1)

  // step 1
  const [restaurantName, setRestaurantName] = useState(pin?.restaurant_name ?? initialName ?? '')
  const [photos, setPhotos] = useState<string[]>(pin?.photos ?? [])
  const [priceRange, setPriceRange] = useState<PriceRange | ''>(pin?.price_range ?? '')
  const [cuisineTags, setCuisineTags] = useState<string[]>(pin?.cuisine_tags ?? [])
  const [rating, setRating] = useState<string>(pin?.rating != null ? String(pin.rating) : '')
  const [uploadingCount, setUploadingCount] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const dragIndexRef = useRef<number | null>(null)

  // step 2
  const [reasoning, setReasoning] = useState<string[]>(pin?.reasoning ?? [])
  const [customReasonInput, setCustomReasonInput] = useState('')
  const [customCuisineInput, setCustomCuisineInput] = useState('')
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
    const ratingNum = parseFloat(rating)
    if (!rating.trim() || isNaN(ratingNum) || ratingNum < 0 || ratingNum > 5) {
      setRatingError(!rating.trim() ? 'Rating is required' : 'Must be between 0 and 5')
      ok = false
    } else {
      setRatingError('')
    }
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
    rating: rating.trim() && !isNaN(parseFloat(rating)) ? parseFloat(rating) : null,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface rounded-2xl overflow-hidden w-full max-w-md max-h-[88vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex justify-between items-center px-5 pt-5 pb-3 shrink-0">
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">
              {isEditing ? 'Edit spot' : 'Add a spot'}
            </h2>
            <p className="font-label-caps text-label-caps text-secondary mt-0.5">
              Step {step} of 3
            </p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors p-1">
            <Icon name="close" />
          </button>
        </div>

        {/* Step indicator — progress bar style */}
        <div className="px-5 pb-4 shrink-0">
          <div className="flex gap-1.5">
            {([1, 2, 3] as const).map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  s <= step ? 'bg-primary' : 'bg-surface-container-high'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 pb-4 flex flex-col gap-5">

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Restaurant name *</span>
                <input
                  type="text"
                  value={restaurantName}
                  onChange={(e) => { setRestaurantName(e.target.value); if (nameError) setNameError('') }}
                  className={inputClass}
                  placeholder="e.g. Meghana Foods"
                />
                {nameError && <span className="font-body-sm text-body-sm text-red-400">{nameError}</span>}
              </label>

              {/* Rating */}
              <div className="flex flex-col gap-1.5">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Your rating *</span>
                <div className="flex items-center gap-3">
                  <Icon name="star" filled className="text-[20px] text-primary shrink-0" />
                  <input
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    value={rating}
                    onChange={(e) => { setRating(e.target.value); if (ratingError) setRatingError('') }}
                    placeholder="4.3"
                    className="w-28 rounded-xl bg-surface-container px-3 py-2.5 font-headline-sm text-headline-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="font-body-base text-body-base text-on-surface-variant">/ 5</span>
                </div>
                {ratingError && <span className="font-body-sm text-body-sm text-red-400">{ratingError}</span>}
              </div>

              {/* Photos */}
              <div className="flex flex-col gap-2">
                <span className="font-label-caps text-label-caps text-on-surface-variant">
                  Photos <span className="normal-case text-secondary font-sans font-normal">(up to 5 · drag to reorder · first is cover)</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {photos.map((url, i) => (
                    <div
                      key={url}
                      draggable
                      onDragStart={() => onDragStart(i)}
                      onDragOver={(e) => onDragOver(e, i)}
                      onDragEnd={onDragEnd}
                      className="relative w-20 h-20 rounded-xl overflow-hidden cursor-grab active:cursor-grabbing group"
                    >
                      <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                      {i === 0 && (
                        <span className="absolute bottom-0 left-0 right-0 bg-primary/80 text-on-primary text-[9px] font-bold text-center py-0.5 font-sans">
                          COVER
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[11px]"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {photos.length < 5 && (
                    <label className="w-20 h-20 rounded-xl border border-dashed border-outline-variant flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors bg-surface-container-low">
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
                {uploadError && <span className="font-body-sm text-body-sm text-red-400">{uploadError}</span>}
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
                      className={`${pillBase} ${priceRange === p ? pillActive : pillInactive}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                {priceError && <span className="font-body-sm text-body-sm text-red-400">{priceError}</span>}
              </div>

              {/* Cuisine tags */}
              <div className="flex flex-col gap-2">
                <span className="font-label-caps text-label-caps text-on-surface-variant">
                  Cuisine <span className="normal-case text-secondary font-sans font-normal">(pick 1–3)</span>
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
                        className={`${pillBase} ${selected ? pillActive : maxed ? pillDisabled : pillInactive}`}
                      >
                        {tag}
                      </button>
                    )
                  })}
                  {cuisineTags.filter((t) => !(CUISINE_TAGS as readonly string[]).includes(t)).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setCuisineTags(cuisineTags.filter((t) => t !== tag))}
                      className={`${pillBase} ${pillActive}`}
                    >
                      {tag} ×
                    </button>
                  ))}
                </div>
                {cuisineTags.length < 3 && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customCuisineInput}
                      onChange={(e) => setCustomCuisineInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const trimmed = customCuisineInput.trim()
                          if (trimmed && !cuisineTags.includes(trimmed)) setCuisineTags([...cuisineTags, trimmed])
                          setCustomCuisineInput('')
                        }
                      }}
                      placeholder="Type your own…"
                      className="flex-1 rounded-xl bg-surface-container px-3 py-2 font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = customCuisineInput.trim()
                        if (trimmed && !cuisineTags.includes(trimmed)) setCuisineTags([...cuisineTags, trimmed])
                        setCustomCuisineInput('')
                      }}
                      disabled={!customCuisineInput.trim()}
                      className="rounded-full px-4 py-2 bg-surface-container font-label-caps text-label-caps text-on-surface-variant hover:bg-primary hover:text-on-primary transition-colors disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <>
              {/* Reasoning — pill-toggle buttons */}
              <div className="flex flex-col gap-2">
                <span className="font-label-caps text-label-caps text-on-surface-variant">
                  Why are you recommending this? <span className="normal-case text-secondary font-sans font-normal">(pick 1–3)</span>
                </span>
                <div className="flex flex-col gap-2">
                  {REASONING_OPTIONS.map((r) => {
                    const checked = reasoning.includes(r)
                    const maxed = reasoning.length >= 3 && !checked
                    return (
                      <button
                        key={r}
                        type="button"
                        disabled={maxed}
                        onClick={() => setReasoning(toggleItem(reasoning, r, 3))}
                        className={`${blockBase} ${checked ? blockActive : blockInactive} ${maxed ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        {r}
                      </button>
                    )
                  })}
                  {reasoning.filter((r) => !(REASONING_OPTIONS as readonly string[]).includes(r)).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReasoning(reasoning.filter((x) => x !== r))}
                      className={`${blockBase} ${blockActive}`}
                    >
                      {r} ×
                    </button>
                  ))}
                  {reasoning.length < 3 && (
                    <div className="flex gap-2 mt-1">
                      <input
                        type="text"
                        value={customReasonInput}
                        onChange={(e) => setCustomReasonInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const trimmed = customReasonInput.trim()
                            if (trimmed && !reasoning.includes(trimmed)) setReasoning([...reasoning, trimmed])
                            setCustomReasonInput('')
                          }
                        }}
                        placeholder="Or type your own…"
                        className="flex-1 rounded-xl bg-surface-container px-3 py-2 font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = customReasonInput.trim()
                          if (trimmed && !reasoning.includes(trimmed)) setReasoning([...reasoning, trimmed])
                          setCustomReasonInput('')
                        }}
                        disabled={!customReasonInput.trim()}
                        className="rounded-full px-4 py-2 bg-surface-container font-label-caps text-label-caps text-on-surface-variant hover:bg-primary hover:text-on-primary transition-colors disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                  )}
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
                    className={inputClass}
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
              <label className="flex flex-col gap-1.5">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Your note</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 280))}
                  rows={3}
                  placeholder="What makes this place worth visiting?"
                  className={textareaClass}
                />
                <span className={`font-label-caps text-label-caps self-end ${note.length >= 260 ? 'text-red-400' : 'text-secondary'}`}>
                  {note.length}/280
                </span>
              </label>

              {/* Insider tip */}
              <label className="flex flex-col gap-1.5">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Insider tip</span>
                <textarea
                  value={insiderTip}
                  onChange={(e) => setInsiderTip(e.target.value.slice(0, 200))}
                  rows={2}
                  placeholder="The secret menu item, which table to ask for, when to avoid the queue…"
                  className={textareaClass}
                />
                <span className={`font-label-caps text-label-caps self-end ${insiderTip.length >= 180 ? 'text-red-400' : 'text-secondary'}`}>
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
                      className={`${pillBase} ${wouldReturn === w ? pillActive : pillInactive}`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <>
              {/* Best time — pill-toggle single select */}
              <div className="flex flex-col gap-2">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Best time to visit</span>
                <div className="flex flex-col gap-2">
                  {BEST_TIME.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setBestTime(bestTime === t ? '' : t)}
                      className={`${blockBase} ${bestTime === t ? blockActive : blockInactive}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Best for — pill-toggle multi select */}
              <div className="flex flex-col gap-2">
                <span className="font-label-caps text-label-caps text-on-surface-variant">
                  Best for <span className="normal-case text-secondary font-sans font-normal">(up to 3)</span>
                </span>
                <div className="flex flex-col gap-2">
                  {BEST_FOR.map((b) => {
                    const checked = bestFor.includes(b)
                    const maxed = bestFor.length >= 3 && !checked
                    return (
                      <button
                        key={b}
                        type="button"
                        disabled={maxed}
                        onClick={() => setBestFor(toggleItem(bestFor, b, 3))}
                        className={`${blockBase} ${checked ? blockActive : blockInactive} ${maxed ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        {b}
                      </button>
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
                      className={`${pillBase} ${vibeTag === v ? pillActive : pillInactive}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {submit.isError && (
            <p className="font-body-sm text-body-sm text-red-400">
              {submit.error instanceof Error ? submit.error.message : 'Could not save pin.'}
            </p>
          )}
        </div>

        {/* Footer — tone shift instead of border line */}
        <div className="bg-surface-container-lowest px-5 py-4 flex flex-col gap-2 shrink-0">
          <div className="flex gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={handleBack}
                className="rounded-xl px-4 py-2.5 bg-surface-container font-label-caps text-label-caps text-on-surface hover:bg-surface-container-high transition-colors"
              >
                Back
              </button>
            )}

            {step < 3 && (
              <button
                type="button"
                onClick={handleNext}
                className="flex-1 rounded-xl py-2.5 bg-primary text-on-primary font-label-caps text-label-caps tracking-wider hover:bg-primary-container transition-colors"
              >
                Next →
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(3)}
                className="rounded-xl px-4 py-2.5 bg-surface-container font-label-caps text-label-caps text-secondary hover:text-on-surface transition-colors"
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
                  className="flex-1 rounded-xl py-2.5 bg-primary text-on-primary font-label-caps text-label-caps tracking-wider hover:bg-primary-container transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submit.isPending ? <><Spinner size={4} /> Publishing…</> : 'Publish'}
                </button>
                <button
                  type="button"
                  onClick={() => submit.mutate()}
                  disabled={!canPublish}
                  className="rounded-xl px-4 py-2.5 bg-surface-container font-label-caps text-label-caps text-secondary hover:text-on-surface transition-colors disabled:opacity-50"
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
              className="w-full rounded-xl py-2.5 bg-surface-container font-label-caps text-label-caps text-secondary hover:text-on-surface transition-colors disabled:opacity-50"
            >
              {submit.isPending ? 'Publishing…' : 'Publish now (add details later)'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
