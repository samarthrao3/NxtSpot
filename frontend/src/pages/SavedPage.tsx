import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { savedPinsApi, type Pin } from '@/lib/api'
import { getAppToken } from '@/lib/auth'
import { TopNavBar } from '@/components/ui/TopNavBar'
import { BottomNavBar } from '@/components/ui/BottomNavBar'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'

export function SavedPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data: pins, isLoading } = useQuery({
    queryKey: ['saved-pins'],
    queryFn: async () => {
      const token = await getAppToken()
      return savedPinsApi.getAll(token)
    },
  })

  const unsave = useMutation({
    mutationFn: async (pinId: string) => {
      const token = await getAppToken()
      return savedPinsApi.unsave(pinId, token)
    },
    onMutate: async (pinId) => {
      await qc.cancelQueries({ queryKey: ['saved-pins'] })
      const previous = qc.getQueryData(['saved-pins'])
      qc.setQueryData<typeof pins>(['saved-pins'], (old) => (old ?? []).filter((p) => p.id !== pinId))
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous !== undefined) qc.setQueryData(['saved-pins'], context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['saved-pins'] }),
  })

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopNavBar />
      <div className="flex flex-1 mt-12">
        <main className="flex-1 w-full px-margin-mobile md:px-margin-desktop py-12 flex flex-col max-w-[1400px] mx-auto pb-24 md:pb-12">

          {/* Page header */}
          <div className="mb-10">
            {!isLoading && !!pins?.length && (
              <p className="font-label-caps text-label-caps text-primary tracking-[0.2em] uppercase mb-3">
                {pins.length} {pins.length === 1 ? 'spot' : 'spots'} saved
              </p>
            )}
            <h1 className="font-display-lg text-display-lg text-on-surface italic leading-tight mb-3">
              Places worth returning to.
            </h1>
            <p className="font-body-base text-body-base text-secondary max-w-sm leading-relaxed">
              Your curated collection of Bangalore's finest, ready when you are.
            </p>
          </div>

          {isLoading && (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          )}

          {/* Empty state */}
          {!isLoading && pins?.length === 0 && (
            <div className="py-20 flex flex-col items-center text-center">
              <p className="font-display-lg text-on-surface-variant italic mb-4 leading-tight" style={{ fontSize: 32 }}>
                Nothing saved yet.
              </p>
              <p className="font-body-base text-body-base text-secondary mb-8 max-w-xs leading-relaxed">
                Tap the bookmark on any pin to save it here for later.
              </p>
              <Link
                to="/map"
                className="rounded-full px-7 py-3 bg-primary text-on-primary font-label-caps text-label-caps uppercase tracking-wider hover:bg-primary-container transition-colors"
              >
                Open map →
              </Link>
            </div>
          )}

          {/* Masonry grid */}
          {pins && pins.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-start">
              {pins.map((pin) => (
                <SavedCard
                  key={pin.id}
                  pin={pin}
                  unsaving={unsave.isPending && unsave.variables === pin.id}
                  onOpen={() => navigate('/map', { state: { focusPin: pin } })}
                  onUnsave={() => unsave.mutate(pin.id)}
                />
              ))}
            </div>
          )}
        </main>
      </div>
      <BottomNavBar />
    </div>
  )
}

function SavedCard({
  pin,
  unsaving,
  onOpen,
  onUnsave,
}: {
  pin: Pin
  unsaving: boolean
  onOpen: () => void
  onUnsave: () => void
}) {
  const mustOrder = pin.must_order_dishes?.filter(Boolean)[0] ?? pin.must_order ?? null

  return (
    <article
      onClick={onOpen}
      className="rounded-2xl overflow-hidden cursor-pointer group"
    >
      {/* Photo */}
      {pin.photos[0] ? (
        <div className="relative w-full overflow-hidden" style={{ paddingBottom: '75%' }}>
          <img
            src={pin.photos[0]}
            alt={pin.restaurant_name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {/* Rating badge */}
          {pin.rating != null && (
            <div className="absolute bottom-2.5 left-2.5 rounded-lg bg-black/60 backdrop-blur-sm px-2 py-0.5 flex items-center gap-1">
              <Icon name="star" filled className="text-[10px] text-primary" />
              <span className="font-label-caps text-label-caps text-white" style={{ fontSize: 10 }}>{pin.rating}</span>
            </div>
          )}
          {/* Bookmark button */}
          <button
            onClick={(e) => { e.stopPropagation(); onUnsave() }}
            disabled={unsaving}
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-primary transition-colors disabled:opacity-50"
          >
            <Icon name="bookmark" filled className="text-primary hover:text-on-primary text-[16px]" />
          </button>
        </div>
      ) : (
        /* No-photo placeholder */
        <div className="relative w-full bg-surface-container-high flex items-center justify-center" style={{ paddingBottom: '56%' }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-display-lg text-on-surface-variant italic opacity-20" style={{ fontSize: 56 }}>
              {pin.restaurant_name[0]}
            </span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onUnsave() }}
            disabled={unsaving}
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-surface-container flex items-center justify-center hover:bg-primary transition-colors disabled:opacity-50"
          >
            <Icon name="bookmark" filled className="text-primary text-[16px]" />
          </button>
        </div>
      )}

      {/* Info panel — dark shelf beneath the photo */}
      <div className="bg-surface-container-lowest px-4 pt-3 pb-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-headline-sm text-headline-sm text-on-surface leading-tight min-w-0">
            {pin.restaurant_name}
          </h3>
          {pin.rating != null && !pin.photos[0] && (
            <div className="flex items-center gap-0.5 shrink-0 text-primary">
              <Icon name="star" filled className="text-[12px]" />
              <span className="font-label-caps text-label-caps">{pin.rating}</span>
            </div>
          )}
        </div>

        {/* Tags row */}
        {(pin.vibe_tag || pin.price_range || pin.cuisine_tags?.length) && (
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {pin.vibe_tag && (
              <span className="rounded-full px-2.5 py-0.5 bg-surface-container font-label-caps text-on-surface-variant" style={{ fontSize: 9 }}>
                {pin.vibe_tag}
              </span>
            )}
            {pin.price_range && (
              <span className="rounded-full px-2.5 py-0.5 bg-surface-container font-label-caps text-on-surface-variant" style={{ fontSize: 9 }}>
                {pin.price_range}
              </span>
            )}
            {pin.cuisine_tags?.slice(0, 2).map((tag) => (
              <span key={tag} className="rounded-full px-2.5 py-0.5 bg-surface-container font-label-caps text-on-surface-variant" style={{ fontSize: 9 }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Note */}
        {pin.note && (
          <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mb-2 italic leading-relaxed">
            "{pin.note}"
          </p>
        )}

        {/* Must-order */}
        {mustOrder && (
          <p className="font-label-caps text-primary" style={{ fontSize: 9 }}>
            ★ {mustOrder}
          </p>
        )}

        {/* View on map hint */}
        <p className="font-label-caps text-secondary mt-2.5 group-hover:text-primary transition-colors" style={{ fontSize: 9 }}>
          View on map →
        </p>
      </div>
    </article>
  )
}
