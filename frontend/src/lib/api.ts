const API_URL = import.meta.env.VITE_API_URL as string

// ---------- Core fetch ----------

async function apiFetch<T>(
  path: string,
  options?: RequestInit & { token?: string },
): Promise<T> {
  const { token, ...rest } = options ?? {}
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  }
  const res = await fetch(`${API_URL}${path}`, { ...rest, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    const detail = body.detail
    const message = Array.isArray(detail)
      ? detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join('; ')
      : detail
    throw new Error(message || res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ---------- Domain types ----------

export type VibeTag = 'Casual' | 'Date Night' | 'Hidden Gem' | 'Street Food'
export type PriceRange = '₹' | '₹₹' | '₹₹₹'

export interface Pin {
  id: string
  influencer_id: string
  restaurant_name: string
  lat: number
  lng: number
  photos: string[]
  vibe_tag: VibeTag | null
  price_range: PriceRange | null
  must_order: string | null
  note: string | null
  rating: number | null
  created_at: string
  price_per_head: string | null
  cuisine_tags: string[] | null
  reasoning: string[] | null
  must_order_dishes: string[] | null
  insider_tip: string | null
  would_return: string | null
  best_time: string | null
  best_for: string[] | null
}

export interface Influencer {
  id: string
  name: string
  handle: string
  avatar_url: string | null
  pin_count: number
  follower_count: number
}

export interface InfluencerPage {
  items: Influencer[]
  has_more: boolean
}

export interface UserProfile {
  id: string
  email: string
  name: string | null
  role: 'user' | 'influencer'
  handle: string | null
  avatar_url: string | null
}

// ---------- Auth ----------

export const authApi = {
  login: (supabaseAccessToken: string) =>
    apiFetch<{ access_token: string; user: UserProfile }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ access_token: supabaseAccessToken }),
    }),

  me: (token: string) => apiFetch<UserProfile>('/auth/me', { token }),
}

// ---------- Pins ----------

export const pinsApi = {
  getByInfluencer: (influencerId: string) =>
    apiFetch<Pin[]>(`/pins/influencer/${influencerId}`),

  create: (data: Omit<Pin, 'id' | 'influencer_id' | 'created_at'>, token: string) =>
    apiFetch<Pin>('/pins', { method: 'POST', body: JSON.stringify(data), token }),

  update: (id: string, data: Partial<Omit<Pin, 'id' | 'influencer_id' | 'created_at'>>, token: string) =>
    apiFetch<Pin>(`/pins/${id}`, { method: 'PATCH', body: JSON.stringify(data), token }),

  delete: (id: string, token: string) =>
    apiFetch<void>(`/pins/${id}`, { method: 'DELETE', token }),
}

// ---------- Influencers ----------

export const influencersApi = {
  getByHandle: (handle: string) =>
    apiFetch<Influencer>(`/influencers/${handle}`),

  getPage: (limit: number, offset: number) =>
    apiFetch<InfluencerPage>(`/influencers?limit=${limit}&offset=${offset}`),
}

// ---------- Feed ----------

export interface RestaurantGroup {
  restaurant_key: string
  lat: number
  lng: number
  pins: Pin[]
}

export const feedApi = {
  get: (token: string) => apiFetch<RestaurantGroup[]>('/feed', { token }),
}

// ---------- Subscriptions ----------

export const subscriptionsApi = {
  follow: (influencerId: string, token: string) =>
    apiFetch<void>(`/subscriptions/${influencerId}`, { method: 'POST', token }),

  unfollow: (influencerId: string, token: string) =>
    apiFetch<void>(`/subscriptions/${influencerId}`, { method: 'DELETE', token }),

  getFollowing: (token: string) =>
    apiFetch<{ influencer_id: string }[]>('/subscriptions', { token }),

  getFollowingInfluencers: (token: string) =>
    apiFetch<Influencer[]>('/subscriptions/influencers', { token }),
}

// ---------- Users ----------

export const usersApi = {
  updateMe: (data: { name?: string | null; avatar_url?: string | null; handle?: string | null }, token: string) =>
    apiFetch<UserProfile>('/users/me', { method: 'PATCH', body: JSON.stringify(data), token }),

  deleteMe: (token: string) => apiFetch<void>('/users/me', { method: 'DELETE', token }),
}

// ---------- Saved pins ----------

export const savedPinsApi = {
  save: (pinId: string, token: string) =>
    apiFetch<void>(`/users/me/saved/${pinId}`, { method: 'POST', token }),

  unsave: (pinId: string, token: string) =>
    apiFetch<void>(`/users/me/saved/${pinId}`, { method: 'DELETE', token }),

  getAll: (token: string) => apiFetch<Pin[]>('/users/me/saved', { token }),
}

// ---------- Media ----------

export const mediaApi = {
  getPresignedUrl: (filename: string, token: string) =>
    apiFetch<{ url: string; public_url: string; content_type: string }>('/media/presigned-url', {
      method: 'POST',
      body: JSON.stringify({ filename }),
      token,
    }),
}
