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

// Cycle of heights for the masonry grid — creates Pinterest-style waterfall rhythm
const ASPECT_CYCLE = ['120%', '88%', '140%', '100%', '112%', '80%', '130%', '95%']

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
        {/* Full-bleed hero — no hard border, content breathes into the page */}
        <div className="px-margin-mobile md:px-margin-desktop py-16 md:py-24">
          <div className="max-w-container-max mx-auto">
            <p className="font-label-caps text-label-caps text-primary tracking-[0.2em] uppercase mb-4">
              {session ? "Bangalore's Most Trusted Voices" : "Bangalore's Food Inner Circle"}
            </p>
            <h1 className="font-display-lg text-display-lg text-on-surface italic max-w-2xl leading-tight">
              {session
                ? 'Discover Bangalore, one table at a time.'
                : 'The best seats in the city, kept by people who know.'}
            </h1>
            <p className="font-body-base text-body-base text-secondary max-w-lg mt-4 leading-relaxed">
              {session
                ? "Every spot on this map has been eaten at, mulled over, and personally vouched for. No algorithms. No sponsored posts."
                : "Not an algorithm. Not a star rating. People you trust, who eat where you want to be."}
            </p>
            {!session && (
              <button
                onClick={signIn}
                className="mt-8 rounded-full bg-primary text-on-primary font-label-caps text-label-caps px-7 py-3 uppercase tracking-wider hover:bg-primary-container transition-colors"
              >
                See who's eating well →
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop">
          {isLoading || (!!session && followingLoading) ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : session ? (
            <>
              {/* Search + category filters */}
              <div className="mb-10">
                <input
                  type="text"
                  placeholder="Search by name or handle…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full max-w-md rounded-xl bg-surface-container-low px-4 py-2.5 font-body-base text-body-base text-on-surface placeholder:text-secondary focus:outline-none focus:bg-surface-container transition-colors mb-5"
                />
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`rounded-full px-5 py-2 font-label-caps text-label-caps tracking-wider uppercase transition-colors ${
                        activeCategory === cat
                          ? 'bg-primary text-on-primary'
                          : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {filteredInfluencers.length === 0 ? (
                <p className="text-secondary font-body-base text-body-base py-16 text-center">
                  {q ? 'No curators match your search.' : 'No influencers yet.'}
                </p>
              ) : (
                <>
                  {/* Featured spotter — magazine split, rounded, no border */}
                  {featuredInfluencer && (
                    <article
                      className="w-full rounded-2xl mb-10 group cursor-pointer flex overflow-hidden bg-surface-container-lowest"
                      style={{ minHeight: 380 }}
                      onClick={() => setSelectedInfluencer(featuredInfluencer)}
                    >
                      {/* Left: portrait photo */}
                      <div className="relative w-1/2 shrink-0 overflow-hidden">
                        {featuredInfluencer.avatar_url ? (
                          <img
                            src={featuredInfluencer.avatar_url}
                            alt={featuredInfluencer.name}
                            referrerPolicy="no-referrer"
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-surface-container-high flex items-center justify-center">
                            <span className="font-display-lg text-display-lg text-on-surface-variant italic">
                              {featuredInfluencer.name[0]}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Right: dark editorial panel */}
                      <div className="flex-1 flex flex-col justify-between p-6 md:p-10">
                        <span className="font-label-caps text-label-caps text-primary tracking-[0.2em] uppercase self-start text-[10px]">
                          ★ Featured Spotter
                        </span>
                        <div>
                          <h2 className="font-display-lg text-display-lg text-on-surface italic leading-tight mb-4">
                            {featuredInfluencer.name}
                          </h2>
                          <p className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-1">
                            @{featuredInfluencer.handle}
                          </p>
                          <p className="font-label-caps text-label-caps text-secondary mb-8">
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
                              className="rounded-full px-6 py-2.5 bg-primary text-on-primary font-label-caps text-label-caps uppercase tracking-wider hover:bg-primary-container transition-colors disabled:opacity-50"
                            >
                              {followingIds.has(featuredInfluencer.id) ? 'Following' : 'Follow'}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedInfluencer(featuredInfluencer) }}
                              className="rounded-full px-6 py-2.5 bg-surface-container text-on-surface font-label-caps text-label-caps uppercase tracking-wider hover:bg-surface-container-high transition-colors"
                            >
                              View Spots →
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  )}

                  {/* Masonry curator grid — Pinterest-style waterfall */}
                  {gridInfluencers.length > 0 && (
                    <section className="columns-2 md:columns-3 gap-x-4">
                      {gridInfluencers.map((inf, i) => (
                        <CuratorCard
                          key={inf.id}
                          index={i}
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
                    <div className="flex justify-center pt-10">
                      <button
                        onClick={() => fetchNextPage()}
                        className="rounded-full bg-surface-container text-on-surface font-label-caps text-label-caps uppercase tracking-wider px-8 py-3 hover:bg-primary hover:text-on-primary transition-colors"
                      >
                        Load more
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="flex items-center justify-between mb-8">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Meet the Curators</h2>
              <button
                onClick={signIn}
                className="font-label-caps text-label-caps text-primary uppercase tracking-wider hover:underline"
              >
                Sign in to follow →
              </button>
            </div>
          )}
        </div>

        {/* Full-width marquee (logged-out only) */}
        {!session && allInfluencers && allInfluencers.length > 0 && (
          <div
            className="overflow-hidden relative mt-2"
            style={{ width: '100vw', left: '50%', transform: 'translateX(-50%)' }}
          >
            <div className="flex gap-4 animate-marquee" style={{ width: 'max-content' }}>
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
          <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant shrink-0">
            <button
              onClick={() => setSelectedInfluencer(null)}
              className="text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <Icon name="close" />
            </button>
          </div>

          <div className="px-4 py-4 flex flex-col items-center border-b border-outline-variant shrink-0">
            <div className="w-20 h-20 mb-3 rounded-full overflow-hidden">
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
            <div className="flex gap-6 mb-4">
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
              onClick={() => handleFollowClick(selectedInfluencer.id)}
              disabled={
                (follow.isPending && follow.variables === selectedInfluencer.id) ||
                (unfollow.isPending && unfollow.variables === selectedInfluencer.id)
              }
              className={`w-full rounded-full py-2.5 font-label-caps text-label-caps uppercase tracking-wider transition-colors disabled:opacity-50 ${
                followingIds.has(selectedInfluencer.id)
                  ? 'bg-primary text-on-primary hover:bg-primary-container'
                  : 'bg-surface-container text-on-surface hover:bg-primary hover:text-on-primary'
              }`}
            >
              {followingIds.has(selectedInfluencer.id) ? 'Following' : 'Follow'}
            </button>
          </div>

          <div className="flex flex-col overflow-y-auto">
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
                <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-surface-container">
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
  index,
}: {
  influencer: Influencer
  following: boolean
  selected: boolean
  onSelect: () => void
  onFollowClick: () => void
  pending: boolean
  index: number
}) {
  const aspectPct = ASPECT_CYCLE[index % ASPECT_CYCLE.length]
  return (
    <div className="break-inside-avoid mb-4">
      <article onClick={onSelect} className="cursor-pointer group">
        {/* Image — no border, rounded, variable height */}
        <div
          className={`relative w-full overflow-hidden rounded-2xl mb-3 transition-all ${
            selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
          }`}
          style={{ paddingBottom: aspectPct }}
        >
          {influencer.avatar_url ? (
            <img
              src={influencer.avatar_url}
              alt={influencer.name}
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 bg-surface-container-high flex items-center justify-center">
              <span className="font-headline-md text-headline-md text-on-surface-variant italic">
                {influencer.name[0]}
              </span>
            </div>
          )}
          {/* Hover overlay — visual feedback only, no action hidden behind it */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none" />
        </div>

        {/* Text + always-visible follow button */}
        <div className="px-1 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-on-surface leading-tight mb-0.5 font-sans">
              {influencer.name}
            </h2>
            <p className="font-body-sm text-body-sm text-secondary md:hidden">
              {influencer.follower_count} followers
            </p>
            <p className="font-body-sm text-body-sm text-secondary md:hidden">
              {influencer.pin_count} spots
            </p>
            <p className="font-body-sm text-body-sm text-secondary hidden md:block">
              {influencer.pin_count} spots · {influencer.follower_count} followers
            </p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onFollowClick() }}
            disabled={pending}
            className={`shrink-0 mt-0.5 rounded-full px-3 py-1 font-label-caps uppercase tracking-wider disabled:opacity-50 transition-colors whitespace-nowrap ${
              following
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface-variant hover:bg-primary hover:text-on-primary'
            }`}
            style={{ fontSize: '9px' }}
          >
            {following ? '✓ Following' : '+ Follow'}
          </button>
        </div>
      </article>
    </div>
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
    <article className="relative w-64 shrink-0 overflow-hidden rounded-2xl" style={{ height: 280 }}>
      {influencer.avatar_url ? (
        <img
          src={influencer.avatar_url}
          alt={influencer.name}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-surface-container" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <p className="font-label-caps text-label-caps text-white/60 uppercase mb-0.5 truncate" style={{ fontSize: 10 }}>
          @{influencer.handle}
        </p>
        <p className="text-base font-semibold text-white mb-3 leading-tight font-sans">{influencer.name}</p>
        <button
          onClick={onFollowClick}
          disabled={pending}
          className="rounded-full px-4 py-1.5 bg-primary text-on-primary font-label-caps uppercase tracking-wider hover:bg-primary-container transition-colors disabled:opacity-50"
          style={{ fontSize: 10 }}
        >
          Follow
        </button>
      </div>
    </article>
  )
}
