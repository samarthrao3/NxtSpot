import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getAppToken } from '@/lib/auth'
import { useSession } from '@/lib/useSession'
import { useCurrentUser } from '@/lib/useCurrentUser'
import { influencersApi, subscriptionsApi, type Influencer } from '@/lib/api'
import { TopNavBar } from '@/components/ui/TopNavBar'
import { BottomNavBar } from '@/components/ui/BottomNavBar'
import { Spinner } from '@/components/ui/Spinner'

export function ExplorePage() {
  const session = useSession()
  const qc = useQueryClient()
  const { data: currentUser } = useCurrentUser()

  const { data: influencers, isLoading } = useQuery({
    queryKey: ['influencers'],
    queryFn: influencersApi.getAll,
  })
  const visibleInfluencers = influencers?.filter((inf) => inf.id !== currentUser?.id)

  const { data: following } = useQuery({
    queryKey: ['following'],
    queryFn: async () => {
      const token = await getAppToken()
      return subscriptionsApi.getFollowing(token)
    },
    enabled: !!session,
  })
  const followingIds = new Set(following?.map((f) => f.influencer_id))

  const follow = useMutation({
    mutationFn: async (influencerId: string) => {
      const token = await getAppToken()
      return subscriptionsApi.follow(influencerId, token)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['following'] })
      qc.invalidateQueries({ queryKey: ['feed'] })
    },
  })
  const unfollow = useMutation({
    mutationFn: async (influencerId: string) => {
      const token = await getAppToken()
      return subscriptionsApi.unfollow(influencerId, token)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['following'] })
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
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopNavBar />
      <main className="flex-1 mt-12 p-margin-mobile md:p-margin-desktop max-w-container-max mx-auto w-full pb-24 md:pb-16">
        <header className="mb-12 md:mb-16 max-w-2xl">
          <h1 className="font-display-lg text-display-lg text-on-surface mb-4">
            Discover Bangalore, one table at a time.
          </h1>
          <p className="font-body-base text-body-base text-secondary max-w-lg">
            Curated selections from the city's most discerning palates. Explore independent
            cafes, fine dining hideaways, and iconic street food corners.
          </p>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !visibleInfluencers?.length ? (
          <p className="text-secondary font-body-base text-body-base">No influencers yet.</p>
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
            {visibleInfluencers.map((inf) => (
              <InfluencerCard
                key={inf.id}
                influencer={inf}
                following={followingIds.has(inf.id)}
                onFollowClick={() => handleFollowClick(inf.id)}
                pending={follow.isPending || unfollow.isPending}
              />
            ))}
          </section>
        )}
      </main>
      <BottomNavBar />
    </div>
  )
}

function InfluencerCard({
  influencer,
  following,
  onFollowClick,
  pending,
}: {
  influencer: Influencer
  following: boolean
  onFollowClick: () => void
  pending: boolean
}) {
  return (
    <article className="flex flex-col items-center p-6 border border-outline-variant bg-surface hover:border-primary transition-colors group">
      <Link to={`/i/${influencer.handle}`} className="w-24 h-24 mb-4 border border-outline-variant p-1">
        {influencer.avatar_url ? (
          <img
            src={influencer.avatar_url}
            alt={influencer.name}
            className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface-container text-on-surface-variant font-headline-sm text-headline-sm">
            {influencer.name[0]}
          </div>
        )}
      </Link>
      <Link
        to={`/i/${influencer.handle}`}
        className="font-label-caps text-label-caps text-primary tracking-[0.1em] mb-2 uppercase"
      >
        @{influencer.handle}
      </Link>
      <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">{influencer.name}</h2>
      <p className="font-body-sm text-body-sm text-secondary mb-6">
        {influencer.pin_count} recommendations
      </p>
      <button
        onClick={onFollowClick}
        disabled={pending}
        className={`w-full py-2 border font-label-caps text-label-caps uppercase tracking-wider transition-colors disabled:opacity-50 ${
          following
            ? 'bg-primary text-on-primary border-primary'
            : 'border-outline text-on-surface hover:bg-primary hover:text-on-primary hover:border-primary'
        }`}
      >
        {following ? 'Following' : 'Follow'}
      </button>
    </article>
  )
}
