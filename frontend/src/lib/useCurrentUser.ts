import { useQuery } from '@tanstack/react-query'
import { authApi } from './api'
import { getAppToken } from './auth'
import { useSession } from './useSession'

export function useCurrentUser() {
  const session = useSession()

  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const token = await getAppToken()
      return authApi.me(token)
    },
    enabled: !!session,
  })
}
