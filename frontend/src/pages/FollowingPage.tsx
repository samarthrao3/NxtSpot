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
          <div className="mb-12 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-outline-variant pb-6">
            <div>
              <h1 className="font-display-lg text-display-lg text-on-surface mb-2 tracking-tight">
                Following
              </h1>
              <p className="font-body-base text-body-base text-secondary">
                Curators whose spots appear on your map.
              </p>
            </div>
            {!!followedInfluencers.length && (
              <span className="font-body-sm text-body-sm text-secondary shrink-0">
                {followedInfluencers.length} {followedInfluencers.length === 1 ? 'curator' : 'curators'}
              </span>
            )}
          </div>

          <div className="mb-8">
            <input
              type="text"
              placeholder="Search by name or handle…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full max-w-md border border-outline-variant px-4 py-2 font-body-base text-body-base bg-surface text-on-surface placeholder:text-secondary focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {isLoading && (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          )}

          {!isLoading && followedInfluencers.length === 0 && (
            <div className="text-center py-16 text-secondary">
              {q ? (
                <p className="font-headline-sm text-headline-sm">No curators match your search.</p>
              ) : (
                <>
                  <p className="font-headline-sm text-headline-sm">Not following anyone yet</p>
                  <p className="font-body-base text-body-base mt-1">
                    Head to{' '}
                    <Link to="/explore" className="text-primary hover:underline">
                      Discover
                    </Link>{' '}
                    to find curators to follow.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
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
      <BottomNavBar />

      {selectedInfluencer && (
        <aside className="fixed top-12 right-0 bottom-14 md:bottom-0 w-full md:w-[400px] bg-surface border-l border-outline-variant z-40 flex flex-col overflow-hidden animate-slide-in-right">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant shrink-0">
            <button
              onClick={() => setSelectedInfluencer(null)}
              className="text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <Icon name="close" />
            </button>
            <Link
              to={`/i/${selectedInfluencer.handle}`}
              className="font-label-caps text-label-caps text-secondary hover:text-primary uppercase tracking-wider transition-colors flex items-center gap-1"
            >
              View map
              <Icon name="open_in_new" className="text-[14px]" />
            </Link>
          </div>

          {/* Influencer hero */}
          <div className="px-4 py-4 flex flex-col items-center border-b border-outline-variant shrink-0">
            <div className="w-16 h-16 mb-3 border border-outline-variant p-1">
              {selectedInfluencer.avatar_url ? (
                <img
                  src={selectedInfluencer.avatar_url}
                  alt={selectedInfluencer.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-surface-container text-on-surface-variant font-headline-sm text-headline-sm">
                  {selectedInfluencer.name[0]}
                </div>
              )}
            </div>
            <p className="font-label-caps text-label-caps text-primary tracking-[0.1em] uppercase mb-1">
              @{selectedInfluencer.handle}
            </p>
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-3">
              {selectedInfluencer.name}
            </h2>
            <div className="flex gap-6 mb-3">
              <div className="text-center">
                <p className="font-headline-sm text-headline-sm text-on-surface">{selectedInfluencer.pin_count}</p>
                <p className="font-label-caps text-label-caps text-secondary uppercase">Pins</p>
              </div>
              <div className="text-center">
                <p className="font-headline-sm text-headline-sm text-on-surface">{selectedInfluencer.follower_count}</p>
                <p className="font-label-caps text-label-caps text-secondary uppercase">Followers</p>
              </div>
            </div>
            <button
              onClick={() => unfollow.mutate(selectedInfluencer.id)}
              disabled={unfollow.isPending && unfollow.variables === selectedInfluencer.id}
              className="w-full py-2 border border-primary bg-primary text-on-primary font-label-caps text-label-caps uppercase tracking-wider hover:bg-transparent hover:text-primary transition-colors disabled:opacity-50"
            >
              Unfollow
            </button>
          </div>

          {/* Pins list — capped at 3 */}
          <div className="flex flex-col">
            <p className="px-4 py-2 font-label-caps text-label-caps text-secondary uppercase border-b border-outline-variant shrink-0">
              Spots
            </p>
            {loadingPins && (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            )}
            {!loadingPins && selectedPins?.length === 0 && (
              <p className="px-4 py-4 font-body-sm text-body-sm text-secondary">No spots yet.</p>
            )}
            {selectedPins?.slice(0, 3).map((pin) => (
              <div
                key={pin.id}
                className="flex gap-3 px-4 py-3 border-b border-outline-variant hover:bg-surface-container-low transition-colors"
              >
                <div className="w-12 h-12 shrink-0 bg-surface-container border border-outline-variant overflow-hidden">
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
      className={`flex flex-col items-center p-6 border bg-surface cursor-pointer transition-colors ${
        selected ? 'border-primary' : 'border-outline-variant hover:border-primary'
      }`}
    >
      <div className="w-24 h-24 mb-4 border border-outline-variant p-1">
        {influencer.avatar_url ? (
          <img
            src={influencer.avatar_url}
            alt={influencer.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface-container text-on-surface-variant font-headline-sm text-headline-sm">
            {influencer.name[0]}
          </div>
        )}
      </div>
      <p className="font-label-caps text-label-caps text-primary tracking-[0.1em] mb-2 uppercase truncate w-full text-center">
        @{influencer.handle}
      </p>
      <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">{influencer.name}</h2>
      <p className="font-body-sm text-body-sm text-secondary mb-6">
        {influencer.pin_count} {influencer.pin_count === 1 ? 'spot' : 'spots'}
      </p>
      <button
        onClick={(e) => { e.stopPropagation(); onUnfollow() }}
        disabled={pending}
        className="w-full py-2 border border-primary bg-primary text-on-primary font-label-caps text-label-caps uppercase tracking-wider hover:bg-transparent hover:text-primary transition-colors disabled:opacity-50"
      >
        Unfollow
      </button>
    </article>
  )
}
