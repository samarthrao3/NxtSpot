import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAppToken } from '@/lib/auth'
import { pinsApi, subscriptionsApi, type Influencer } from '@/lib/api'
import { TopNavBar } from '@/components/ui/TopNavBar'
import { BottomNavBar } from '@/components/ui/BottomNavBar'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'

export function FollowingPage() {
  const qc = useQueryClient()
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const { data: followedInfluencers = [], isLoading } = useQuery({
    queryKey: ['following-influencers'],
    queryFn: async () => {
      const token = await getAppToken()
      return subscriptionsApi.getFollowingInfluencers(token)
    },
  })

  const q = searchQuery.trim().toLowerCase()
  const visibleInfluencers = followedInfluencers.filter(
    (inf) => !q || inf.name?.toLowerCase().includes(q) || inf.handle?.toLowerCase().includes(q),
  )

  const { data: selectedPins, isLoading: loadingPins } = useQuery({
    queryKey: ['pins', 'influencer', selectedInfluencer?.id],
    queryFn: () => pinsApi.getByInfluencer(selectedInfluencer!.id),
    enabled: !!selectedInfluencer,
    staleTime: 5 * 60 * 1000,
  })

  const unfollow = useMutation({
    mutationFn: async (influencerId: string) => {
      const token = await getAppToken()
      return subscriptionsApi.unfollow(influencerId, token)
    },
    onMutate: async (influencerId) => {
      await qc.cancelQueries({ queryKey: ['following-influencers'] })
      const previous = qc.getQueryData<Influencer[]>(['following-influencers'])
      qc.setQueryData<Influencer[]>(['following-influencers'], (old) =>
        (old ?? []).filter((inf) => inf.id !== influencerId),
      )
      if (selectedInfluencer?.id === influencerId) setSelectedInfluencer(null)
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous !== undefined) qc.setQueryData(['following-influencers'], context.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['following'] })
      qc.invalidateQueries({ queryKey: ['following-influencers'] })
      qc.invalidateQueries({ queryKey: ['feed'] })
    },
  })

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopNavBar />
      <div className="flex flex-1 mt-12">
        <main className="flex-1 w-full px-margin-mobile md:px-margin-desktop py-12 flex flex-col max-w-[1400px] mx-auto pb-24 md:pb-12">

          {/* Page header — editorial, no hard border */}
          <div className="mb-10">
            {!isLoading && followedInfluencers.length > 0 && (
              <p className="font-label-caps text-label-caps text-primary tracking-[0.2em] uppercase mb-3">
                {followedInfluencers.length} {followedInfluencers.length === 1 ? 'curator' : 'curators'}
              </p>
            )}
            <h1 className="font-display-lg text-display-lg text-on-surface italic leading-tight mb-3">
              Your inner circle.
            </h1>
            <p className="font-body-base text-body-base text-secondary max-w-sm leading-relaxed">
              Curators whose spots appear on your map.
            </p>
          </div>

          {/* Search */}
          {followedInfluencers.length > 0 && (
            <div className="mb-8">
              <input
                type="text"
                placeholder="Search by name or handle…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full max-w-md rounded-xl bg-surface-container-low px-4 py-2.5 font-body-base text-body-base text-on-surface placeholder:text-secondary focus:outline-none focus:bg-surface-container transition-colors"
              />
            </div>
          )}

          {isLoading && (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          )}

          {/* Empty state */}
          {!isLoading && followedInfluencers.length === 0 && (
            <div className="py-20 flex flex-col items-center text-center">
              <p className="font-display-lg text-on-surface-variant italic mb-4 leading-tight"
                style={{ fontSize: 32 }}>
                {q ? 'No one matches.' : 'Your map is quiet.'}
              </p>
              <p className="font-body-base text-body-base text-secondary mb-8 max-w-xs leading-relaxed">
                {q
                  ? 'Try a different name or handle.'
                  : 'Follow curators on Discover to start building your inner circle.'}
              </p>
              {!q && (
                <Link
                  to="/explore"
                  className="rounded-full px-7 py-3 bg-primary text-on-primary font-label-caps text-label-caps uppercase tracking-wider hover:bg-primary-container transition-colors"
                >
                  Go to Discover →
                </Link>
              )}
            </div>
          )}

          {/* Portrait grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {visibleInfluencers.map((inf) => (
              <FollowingCard
                key={inf.id}
                influencer={inf}
                selected={selectedInfluencer?.id === inf.id}
                onSelect={() => setSelectedInfluencer(inf)}
                onUnfollow={() => unfollow.mutate(inf.id)}
                pending={unfollow.isPending && unfollow.variables === inf.id}
              />
            ))}
          </div>
        </main>
      </div>
      <BottomNavBar hidden={!!selectedInfluencer} />

      {/* Detail panel */}
      {selectedInfluencer && (
        <aside className="fixed top-12 right-0 bottom-0 w-full md:w-[400px] bg-surface border-l border-outline-variant z-40 flex flex-col overflow-hidden animate-slide-in-right">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 shrink-0">
            <button
              onClick={() => setSelectedInfluencer(null)}
              className="text-on-surface-variant hover:text-on-surface transition-colors p-1"
            >
              <Icon name="close" />
            </button>
            <Link
              to={`/i/${selectedInfluencer.handle}`}
              className="font-label-caps text-label-caps text-secondary hover:text-primary uppercase tracking-wider transition-colors flex items-center gap-1"
            >
              View map
              <Icon name="open_in_new" className="text-[13px]" />
            </Link>
          </div>

          {/* Influencer hero */}
          <div className="px-5 pb-5 flex flex-col items-center shrink-0">
            <div className="w-20 h-20 mb-4 rounded-full overflow-hidden bg-surface-container">
              {selectedInfluencer.avatar_url ? (
                <img
                  src={selectedInfluencer.avatar_url}
                  alt={selectedInfluencer.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-on-surface-variant font-headline-sm text-headline-sm">
                  {selectedInfluencer.name[0]}
                </div>
              )}
            </div>
            <p className="font-label-caps text-label-caps text-primary tracking-[0.1em] uppercase mb-1">
              @{selectedInfluencer.handle}
            </p>
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-4 italic font-display-lg">
              {selectedInfluencer.name}
            </h2>
            <div className="flex gap-8 mb-5">
              <div className="text-center">
                <p className="font-headline-sm text-headline-sm text-on-surface">{selectedInfluencer.pin_count}</p>
                <p className="font-label-caps text-label-caps text-secondary uppercase">Spots</p>
              </div>
              <div className="text-center">
                <p className="font-headline-sm text-headline-sm text-on-surface">{selectedInfluencer.follower_count}</p>
                <p className="font-label-caps text-label-caps text-secondary uppercase">Followers</p>
              </div>
            </div>
            <button
              onClick={() => unfollow.mutate(selectedInfluencer.id)}
              disabled={unfollow.isPending && unfollow.variables === selectedInfluencer.id}
              className="w-full rounded-full py-2.5 bg-surface-container font-label-caps text-label-caps text-secondary uppercase tracking-wider hover:bg-red-900/30 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              {unfollow.isPending && unfollow.variables === selectedInfluencer.id ? 'Unfollowing…' : 'Unfollow'}
            </button>
          </div>

          {/* Pins list */}
          <div className="flex flex-col overflow-y-auto border-t border-outline-variant">
            <p className="px-5 py-3 font-label-caps text-label-caps text-secondary uppercase shrink-0">
              Recent spots
            </p>
            {loadingPins && (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            )}
            {!loadingPins && selectedPins?.length === 0 && (
              <p className="px-5 py-4 font-body-sm text-body-sm text-secondary">No spots yet.</p>
            )}
            {selectedPins?.slice(0, 3).map((pin) => (
              <div
                key={pin.id}
                className="flex gap-3 px-5 py-3 border-b border-outline-variant hover:bg-surface-container-low transition-colors"
              >
                <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden bg-surface-container">
                  {pin.photos[0] ? (
                    <img src={pin.photos[0]} alt={pin.restaurant_name} className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <div className="flex flex-col justify-center min-w-0">
                  <p className="font-headline-sm text-headline-sm text-on-surface truncate">{pin.restaurant_name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {pin.vibe_tag && (
                      <span className="font-label-caps text-label-caps text-secondary uppercase">{pin.vibe_tag}</span>
                    )}
                    {pin.price_range && (
                      <span className="font-label-caps text-label-caps text-secondary">{pin.price_range}</span>
                    )}
                    {pin.rating && (
                      <span className="font-label-caps text-label-caps text-primary flex items-center gap-0.5">
                        <Icon name="star" filled className="text-[12px]" />
                        {pin.rating}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  )
}

function FollowingCard({
  influencer,
  selected,
  onSelect,
  onUnfollow,
  pending,
}: {
  influencer: Influencer
  selected: boolean
  onSelect: () => void
  onUnfollow: () => void
  pending: boolean
}) {
  return (
    <article
      onClick={onSelect}
      className={`relative rounded-2xl overflow-hidden cursor-pointer group aspect-[3/4] transition-all ${
        selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
      }`}
    >
      {/* Full-bleed avatar photo */}
      {influencer.avatar_url ? (
        <img
          src={influencer.avatar_url}
          alt={influencer.name}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-surface-container-high flex items-center justify-center">
          <span className="font-display-lg text-on-surface-variant italic" style={{ fontSize: 48 }}>
            {influencer.name[0]}
          </span>
        </div>
      )}

      {/* Dark gradient from bottom */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

      {/* Content overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-3.5">
        <p className="font-label-caps text-white/50 uppercase mb-0.5 truncate" style={{ fontSize: 9 }}>
          @{influencer.handle}
        </p>
        <h2 className="font-display-lg text-white italic leading-tight mb-1 truncate" style={{ fontSize: 17, lineHeight: '22px' }}>
          {influencer.name}
        </h2>
        <p className="font-label-caps text-white/40 mb-3" style={{ fontSize: 9 }}>
          {influencer.pin_count} {influencer.pin_count === 1 ? 'spot' : 'spots'}
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); onUnfollow() }}
          disabled={pending}
          className="w-full rounded-full py-1.5 bg-white/10 backdrop-blur-sm text-white/70 font-label-caps uppercase tracking-wider hover:bg-red-900/40 hover:text-red-300 transition-colors disabled:opacity-50"
          style={{ fontSize: 9 }}
        >
          {pending ? '…' : 'Unfollow'}
        </button>
      </div>
    </article>
  )
}
