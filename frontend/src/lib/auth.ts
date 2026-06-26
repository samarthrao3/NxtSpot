import { supabase } from './supabase'
import { authApi } from './api'
import { queryClient } from './queryClient'

// Cached data scoped to "the current user" -- must not survive a sign-out, or the
// previous user's state (e.g. who they followed) keeps rendering as if still true.
const USER_SCOPED_QUERY_KEYS = ['following', 'saved-pins', 'feed', 'me']

const ME_STORAGE_KEY = 'nxtspot_me'

let appToken: string | null = null
let exchange: Promise<string> | null = null

async function exchangeForAppToken(supabaseAccessToken: string): Promise<string> {
  const { access_token, user } = await authApi.login(supabaseAccessToken)
  appToken = access_token
  queryClient.setQueryData(['me'], user)
  localStorage.setItem(ME_STORAGE_KEY, JSON.stringify(user))
  return access_token
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.access_token) {
    // Seed ['me'] before the exchange completes so the navbar never flashes.
    // Prefer the persisted DB profile (accurate, survives refresh); fall back to
    // Google metadata only on the very first login when nothing is stored yet.
    const stored = localStorage.getItem(ME_STORAGE_KEY)
    if (stored) {
      try { queryClient.setQueryData(['me'], JSON.parse(stored)) } catch { /* ignore */ }
    } else {
      const meta = session.user.user_metadata ?? {}
      queryClient.setQueryData(['me'], {
        id: session.user.id,
        email: session.user.email ?? '',
        name: (meta.full_name ?? meta.name ?? null) as string | null,
        avatar_url: (meta.avatar_url ?? meta.picture ?? null) as string | null,
        role: 'user' as const,
        handle: null,
      })
    }
    exchange = exchangeForAppToken(session.access_token).catch((err) => {
      appToken = null
      throw err
    })
  } else {
    appToken = null
    exchange = null
    localStorage.removeItem(ME_STORAGE_KEY)
    for (const key of USER_SCOPED_QUERY_KEYS) {
      queryClient.removeQueries({ queryKey: [key] })
    }
  }
})

// Resolves with our backend's JWT (not the raw Supabase token), exchanging it
// via POST /auth/login on first use after sign-in. Throws if not signed in.
export async function getAppToken(): Promise<string> {
  if (appToken) return appToken
  if (exchange) return exchange
  const { data } = await supabase.auth.getSession()
  if (!data.session?.access_token) {
    throw new Error('Not signed in')
  }
  exchange = exchangeForAppToken(data.session.access_token)
  return exchange
}
