import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { savedPinsApi } from '@/lib/api'
import { getAppToken } from '@/lib/auth'
import { TopNavBar } from '@/components/ui/TopNavBar'
import { SideNavBar } from '@/components/ui/SideNavBar'
import { BottomNavBar } from '@/components/ui/BottomNavBar'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'

export function SavedPage() {
  const qc = useQueryClient()

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-pins'] }),
  })

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopNavBar />
      <div className="flex flex-1 mt-12">
        <SideNavBar />
        <main className="flex-1 md:ml-[220px] w-full px-margin-mobile md:px-margin-desktop py-12 flex flex-col max-w-[1400px] mx-auto pb-24 md:pb-12">
          <div className="mb-12 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-outline-variant pb-6">
            <div>
              <h1 className="font-display-lg text-display-lg text-on-surface mb-2 tracking-tight">
                Saved Recommendations
              </h1>
              <p className="font-body-base text-body-base text-secondary">
                Your curated collection of Bangalore's finest.
              </p>
            </div>
            {!!pins?.length && (
              <div className="flex gap-2 font-body-sm text-body-sm text-secondary shrink-0">
                <span>{pins.length} {pins.length === 1 ? 'Place' : 'Places'}</span>
              </div>
            )}
          </div>

          {isLoading && (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          )}

          {!isLoading && pins?.length === 0 && (
            <div className="text-center py-16 text-secondary">
              <p className="font-headline-sm text-headline-sm">No saved spots yet</p>
              <p className="font-body-base text-body-base mt-1">Tap the bookmark on any pin to save it here</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pins?.map((pin) => (
              <article
                key={pin.id}
                className="bg-surface-container-lowest border border-outline-variant flex flex-col h-[400px] relative group hover:border-outline transition-colors"
              >
                <button
                  onClick={() => unsave.mutate(pin.id)}
                  disabled={unsave.isPending}
                  className="absolute top-4 right-4 z-10 w-8 h-8 bg-surface-container-lowest border border-outline-variant rounded-full flex items-center justify-center hover:bg-surface-container transition-colors"
                >
                  <Icon name="bookmark" filled className="text-primary text-[18px]" />
                </button>

                <div className="h-[60%] w-full border-b border-outline-variant overflow-hidden bg-surface-container">
                  {pin.photos[0] && (
                    <img
                      src={pin.photos[0]}
                      alt={pin.restaurant_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  )}
                </div>

                <div className="h-[40%] p-4 flex flex-col justify-between bg-surface-container-lowest">
                  <div>
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-headline-md text-headline-md text-on-surface truncate pr-2">
                        {pin.restaurant_name}
                      </h3>
                      {pin.rating && (
                        <div className="flex items-center gap-1 text-primary shrink-0">
                          <Icon name="star" filled className="text-[14px]" />
                          <span className="font-label-caps text-label-caps">{pin.rating}</span>
                        </div>
                      )}
                    </div>
                    {(pin.vibe_tag || pin.price_range) && (
                      <div className="font-label-caps text-label-caps text-secondary mb-2 uppercase tracking-wider">
                        {[pin.vibe_tag, pin.price_range].filter(Boolean).join(' • ')}
                      </div>
                    )}
                    {pin.note && (
                      <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">{pin.note}</p>
                    )}
                  </div>
                  {pin.must_order && (
                    <div className="mt-2 pt-2 border-t border-surface-variant flex justify-between items-center gap-2">
                      <span className="font-body-sm text-body-sm text-secondary shrink-0">Must order:</span>
                      <span className="font-body-sm text-body-sm text-on-surface italic truncate">
                        {pin.must_order}
                      </span>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </main>
      </div>
      <BottomNavBar />
    </div>
  )
}
