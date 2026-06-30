import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getAppToken, FOLLOWING_STORAGE_KEY } from '@/lib/auth'
import { useSession } from '@/lib/useSession'
import { useCurrentUser } from '@/lib/useCurrentUser'
import { influencersApi, pinsApi, subscriptionsApi, type Influencer } from '@/lib/api'
import { TopNavBar } from '@/components/ui/TopNavBar'
import { BottomNavBar } from '@/components/ui/BottomNavBar'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { useState, useEffect } from 'react'

const CATEGORIES = ['All', 'Street Food', 'Coffee & Cafes', 'Local Gems', 'Fine Dining'] as const
type Category = typeof CATEGORIES[number]

function matchCategory(inf: Influencer, category: Category): boolean {
  if (category === 'All') return true
  const h = inf.handle.toLowerCase()
  if (category === 'Street Food') return /street|food|bajji|chaat|tiffin|biriyani|biryani|oota|thindi|vlog/.test(h)
  if (category === 'Coffee & Cafes') return /coffee|filter/.test(h)
  if (category === 'Local Gems') return /bengaluru|bangalore|namma|kannada|ooru|karnataka/.test(h)
  return true
}

export function ExplorePage() {
  const session = useSession()
  const qc = useQueryClient()
  const { data: currentUser } = useCurrentUser()
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<Category>('All')

  const PAGE_SIZE = 12
  const MIN_VISIBLE = 6

  const {
    data: pages,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ['influencers'],
    queryFn: ({ pageParam }) => influencersApi.getPage(PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _all, lastPageParam) =>
      lastPage.has_more ? lastPageParam + PAGE_SIZE : undefined,
    staleTime: 5 * 60 * 1000,
  })

  const allInfluencers = pages?.pages.flatMap((p) => p.items)

  const { data: following, isLoading: followingLoading } = useQuery({
    queryKey: ['following'],
    queryFn: async () => {
      const token = await getAppToken()
      return subscriptionsApi.getFollowing(token)
    },
    enabled: !!session,
  })
  const followingIds = new Set(following?.map((f) => f.influencer_id))

  useEffect(() => {
    if (following) localStorage.setItem(FOLLOWING_STORAGE_KEY, JSON.stringify(following))
  }, [following])

  const q = searchQuery.trim().toLowerCase()
  const visibleInfluencers = allInfluencers
    ?.filter(
      (inf) =>
        inf.id !== currentUser?.id &&
        !followingIds.has(inf.id) &&
        (!q || inf.name.toLowerCase().includes(q) || inf.handle.toLowerCase().includes(q)),
    )
    .sort((a, b) => (b.follower_count ?? 0) - (a.follower_count ?? 0))

  const filteredInfluencers = visibleInfluencers?.filter((inf) => matchCategory(inf, activeCategory)) ?? []
  const featuredInfluencer = filteredInfluencers[0] ?? null
  const gridInfluencers = filteredInfluencers.slice(1)

  // Auto-load next page when filtering leaves too few cards visible
  useEffect(() => {
    if (
      !isLoading &&
      !isFetchingNextPage &&
      hasNextPage &&
      !followingLoading &&
      visibleInfluencers !== undefined &&
      visibleInfluencers.length < MIN_VISIBLE
    ) {
      fetchNextPage()
    }
  }, [visibleInfluencers?.length, isLoading, isFetchingNextPage, hasNextPage, followingLoading, fetchNextPage])

  const { data: selectedPins, isLoading: loadingPins } = useQuery({
    queryKey: ['pins', 'influencer', selectedInfluencer?.id],
    queryFn: () => pinsApi.getByInfluencer(selectedInfluencer!.id),
    enabled: !!selectedInfluencer,
    staleTime: 5 * 60 * 1000,
  })

  const follow = useMutation({
    mutationFn: async (influencerId: string) => {
      const token = await getAppToken()
      return subscriptionsApi.follow(influencerId, token)
    },
    onMutate: async (influencerId) => {
      await qc.cancelQueries({ queryKey: ['following'] })
      const previous = qc.getQueryData<{ influencer_id: string }[]>(['following'])
      qc.setQueryData<{ influencer_id: string }[]>(['following'], (old) => [
        ...(old ?? []),
        { influencer_id: influencerId },
      ])
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous !== undefined) qc.setQueryData(['following'], context.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['following'] })
      qc.invalidateQueries({ queryKey: ['following-influencers'] })
      qc.invalidateQueries({ queryKey: ['feed'] })
    },
  })
  const unfollow = useMutation({
    mutationFn: async (influencerId: string) => {
      const token = await getAppToken()
      return subscriptionsApi.unfollow(influencerId, token)
    },
    onMutate: async (influencerId) => {
      await qc.cancelQueries({ queryKey: ['following'] })
      const previous = qc.getQueryData<{ influencer_id: string }[]>(['following'])
      qc.setQueryData<{ influencer_id: string }[]>(['following'], (old) =>
        (old ?? []).filter((f) => f.influencer_id !== influencerId),
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous !== undefined) qc.setQueryData(['following'], context.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['following'] })
      qc.invalidateQueries({ queryKey: ['following-influencers'] })
      qc.invalidateQueries({ queryKey: ['feed'] })
    },
  })

  const handleFollowClick = (influencerId: string) => {
    if (!session) {
      supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/explore` },
      })
      return
    }
    if (followingIds.has(influencerId)) {
      unfollow.mutate(influencerId)
    } else {
      follow.mutate(influencerId)
      if (selectedInfluencer?.id === influencerId) setSelectedInfluencer(null)
    }
  }

  const signIn = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/explore` },
    })

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopNavBar />

      <main className="flex-1 mt-12 pb-24 md:pb-16">
        {/* Full-bleed hero */}
        <div className="bg-surface-container-lowest border-b border-outline-variant px-margin-mobile md:px-margin-desktop py-16 md:py-24">
          <div className="max-w-container-max mx-auto">
            <p className="font-label-caps text-label-caps text-primary tracking-[0.2em] uppercase mb-4">
              Curators of Bangalore
            </p>
            <h1 className="font-display-lg text-display-lg text-on-surface max-w-2xl">
              {session
                ? 'Discover Bangalore, one table at a time.'
                : "Don't let the best tables go to waste."}
            </h1>
            <p className="font-body-base text-body-base text-secondary max-w-lg mt-4">
              {session
                ? "Curated selections from the city's most discerning palates. Explore independent cafes, fine dining hideaways, and iconic street food corners."
                : 'Follow Bangalore\'s most trusted food voices and build your personal dining map.'}
            </p>
            {!session && (
              <button
                onClick={signIn}
                className="mt-6 border border-primary text-primary font-label-caps text-label-caps px-6 py-3 uppercase tracking-wider hover:bg-primary hover:text-on-primary transition-colors"
              >
                Join the inner circle →
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop pt-10">
          {isLoading || (!!session && followingLoading) ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : session ? (
            <>
              {/* Search + category filters */}
              <div className="mb-8">
                <input
                  type="text"
                  placeholder="Search by name or handle…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full max-w-md border border-outline-variant px-4 py-2 font-body-base text-body-base bg-surface text-on-surface placeholder:text-secondary focus:outline-none focus:border-primary transition-colors mb-4"
                />
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-4 py-1.5 border font-label-caps text-label-caps tracking-wider uppercase transition-colors ${
                        activeCategory === cat
                          ? 'bg-primary text-on-primary border-primary'
                          : 'border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {filteredInfluencers.length === 0 ? (
                <p className="text-secondary font-body-base text-body-base">
                  {q ? 'No curators match your search.' : 'No influencers yet.'}
                </p>
              ) : (
                <>
                  {/* Featured spotter */}
                  {featuredInfluencer && (
                    <article
                      className="relative w-full overflow-hidden border border-outline-variant mb-10 group cursor-pointer"
                      style={{ minHeight: 360 }}
                      onClick={() => setSelectedInfluencer(featuredInfluencer)}
                    >
                      <div className="absolute inset-0">
                        {featuredInfluencer.avatar_url ? (
                          <img
                            src={featuredInfluencer.avatar_url}
                            alt={featuredInfluencer.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full bg-surface-container-high" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
                      </div>
                      <div className="absolute top-6 left-6 z-10">
                        <span className="font-label-caps text-label-caps text-primary tracking-[0.2em] uppercase border border-primary px-3 py-1">
                          FEATURED SPOTTER
                        </span>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 z-10 p-6 md:p-10">
                        <p className="font-label-caps text-label-caps text-white/60 uppercase tracking-wider mb-2">
                          @{featuredInfluencer.handle}
                        </p>
                        <h2 className="font-headline-md text-headline-md text-white mb-1">
                          {featuredInfluencer.name}
                        </h2>
                        <p className="font-label-caps text-label-caps text-white/50 mb-6">
                          {featuredInfluencer.pin_count} spots · {featuredInfluencer.follower_count} followers
                        </p>
                        <div className="flex gap-3 flex-wrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleFollowClick(featuredInfluencer.id)
                            }}
                            disabled={
                              (follow.isPending && follow.variables === featuredInfluencer.id) ||
                              (unfollow.isPending && unfollow.variables === featuredInfluencer.id)
                            }
                            className="px-6 py-2.5 bg-primary text-on-primary font-label-caps text-label-caps uppercase tracking-wider hover:bg-primary-container transition-colors disabled:opacity-50"
                          >
                            {followingIds.has(featuredInfluencer.id) ? 'Following' : 'Follow'}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedInfluencer(featuredInfluencer) }}
                            className="px-6 py-2.5 border border-white/40 text-white font-label-caps text-label-caps uppercase tracking-wider hover:bg-white/10 transition-colors"
                          >
                            View Spots →
                          </button>
                        </div>
                      </div>
                    </article>
                  )}

                  {/* Curator grid */}
                  {gridInfluencers.length > 0 && (
                    <section className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                      {gridInfluencers.map((inf) => (
                        <CuratorCard
                          key={inf.id}
                          influencer={inf}
                          following={followingIds.has(inf.id)}
                          selected={selectedInfluencer?.id === inf.id}
                          onSelect={() => setSelectedInfluencer(inf)}
                          onFollowClick={() => handleFollowClick(inf.id)}
                          pending={
                            (follow.isPending && follow.variables === inf.id) ||
                            (unfollow.isPending && unfollow.variables === inf.id)
                          }
                        />
                      ))}
                    </section>
                  )}

                  {isFetchingNextPage && (
                    <div className="flex justify-center py-8">
                      <Spinner />
                    </div>
                  )}
                  {!isFetchingNextPage && hasNextPage && visibleInfluencers && visibleInfluencers.length >= MIN_VISIBLE && (
                    <div className="flex justify-center pt-8">
                      <button
                        onClick={() => fetchNextPage()}
                        className="border border-outline-variant text-on-surface font-label-caps text-label-caps uppercase tracking-wider px-8 py-3 hover:bg-primary hover:text-on-primary hover:border-primary transition-colors"
                      >
                        Load more
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            /* Logged-out marquee */
            <>
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Meet the Curators</h2>
                <button
                  onClick={signIn}
                  className="font-label-caps text-label-caps text-primary uppercase tracking-wider hover:underline"
                >
                  Sign in to follow →
                </button>
              </div>
            </>
          )}
        </div>

        {/* Full-width marquee (logged-out only) */}
        {!session && allInfluencers && allInfluencers.length > 0 && (
          <div
            className="overflow-hidden relative"
            style={{ width: '100vw', left: '50%', transform: 'translateX(-50%)' }}
          >
            <div className="flex gap-5 animate-marquee" style={{ width: 'max-content' }}>
              {[...allInfluencers.slice(0, 8), ...allInfluencers.slice(0, 8)].map((inf, i) => (
                <MarqueeCard
                  key={i}
                  influencer={inf}
                  onFollowClick={() => handleFollowClick(inf.id)}
                  pending={follow.isPending && follow.variables === inf.id}
                />
              ))}
            </div>
          </div>
        )}
      </main>

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
              onClick={() => handleFollowClick(selectedInfluencer.id)}
              disabled={
                (follow.isPending && follow.variables === selectedInfluencer.id) ||
                (unfollow.isPending && unfollow.variables === selectedInfluencer.id)
              }
              className={`w-full py-2 border font-label-caps text-label-caps uppercase tracking-wider transition-colors disabled:opacity-50 ${
                followingIds.has(selectedInfluencer.id)
                  ? 'bg-primary text-on-primary border-primary hover:bg-transparent hover:text-primary'
                  : 'border-outline text-on-surface hover:bg-primary hover:text-on-primary hover:border-primary'
              }`}
            >
              {followingIds.has(selectedInfluencer.id) ? 'Following' : 'Follow'}
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

function CuratorCard({
  influencer,
  following,
  selected,
  onSelect,
  onFollowClick,
  pending,
}: {
  influencer: Influencer
  following: boolean
  selected: boolean
  onSelect: () => void
  onFollowClick: () => void
  pending: boolean
}) {
  return (
    <article
      onClick={onSelect}
      className={`flex flex-col border bg-surface-container-low cursor-pointer transition-all group ${
        selected ? 'border-primary' : 'border-outline-variant hover:border-primary'
      }`}
    >
      {/* Square avatar area */}
      <div className="relative w-full overflow-hidden" style={{ paddingBottom: '85%' }}>
        {influencer.avatar_url ? (
          <img
            src={influencer.avatar_url}
            alt={influencer.name}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-surface-container-high flex items-center justify-center">
            <span className="font-headline-md text-headline-md text-on-surface-variant">{influencer.name[0]}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-3">
          <span className="font-label-caps text-label-caps text-white/80">
            {influencer.pin_count} {influencer.pin_count === 1 ? 'spot' : 'spots'}
          </span>
        </div>
      </div>

      {/* Card body */}
      <div className="p-4 flex flex-col flex-1">
        <p className="font-label-caps text-label-caps text-primary tracking-[0.1em] uppercase mb-1 truncate">
          @{influencer.handle}
        </p>
        <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1 leading-snug">
          {influencer.name}
        </h2>
        <p className="font-body-sm text-body-sm text-secondary mb-4">
          {influencer.follower_count} {influencer.follower_count === 1 ? 'follower' : 'followers'}
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); onFollowClick() }}
          disabled={pending}
          className={`mt-auto w-full py-2 border font-label-caps text-label-caps uppercase tracking-wider transition-colors disabled:opacity-50 ${
            following
              ? 'bg-primary text-on-primary border-primary'
              : 'border-outline-variant text-on-surface-variant hover:bg-primary hover:text-on-primary hover:border-primary'
          }`}
        >
          {following ? 'Following' : 'Follow'}
        </button>
      </div>
    </article>
  )
}

function MarqueeCard({
  influencer,
  onFollowClick,
  pending,
}: {
  influencer: Influencer
  onFollowClick: () => void
  pending: boolean
}) {
  return (
    <article className="relative w-72 h-72 shrink-0 overflow-hidden border border-outline-variant">
      {influencer.avatar_url ? (
        <img src={influencer.avatar_url} alt={influencer.name} referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-surface-container" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-5">
        <p className="font-label-caps text-label-caps text-white/70 uppercase mb-1 truncate">@{influencer.handle}</p>
        <p className="font-headline-md text-headline-md text-white mb-1">{influencer.name}</p>
        <p className="font-label-caps text-label-caps text-white/60 mb-4">
          {influencer.pin_count} {influencer.pin_count === 1 ? 'Spot' : 'Spots'}
        </p>
        <button
          onClick={onFollowClick}
          disabled={pending}
          className="px-5 py-2 bg-primary text-on-primary font-label-caps text-label-caps uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          Follow
        </button>
      </div>
    </article>
  )
}
