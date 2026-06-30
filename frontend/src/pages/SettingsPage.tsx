import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { mediaApi, usersApi } from '@/lib/api'
import { getAppToken } from '@/lib/auth'
import { useCurrentUser } from '@/lib/useCurrentUser'
import { supabase } from '@/lib/supabase'
import { TopNavBar } from '@/components/ui/TopNavBar'
import { BottomNavBar } from '@/components/ui/BottomNavBar'
import { Spinner } from '@/components/ui/Spinner'

export function SettingsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: currentUser, isLoading } = useCurrentUser()

  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name ?? '')
      setHandle(currentUser.handle ?? '')
      setAvatarUrl(currentUser.avatar_url)
    }
  }, [currentUser])

  const handleAvatarSelect = async (file: File) => {
    setUploading(true)
    setUploadError(null)
    try {
      const token = await getAppToken()
      const { url, public_url, content_type } = await mediaApi.getPresignedUrl(file.name, token)
      const res = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': content_type } })
      if (!res.ok) throw new Error('Upload failed')
      setAvatarUrl(public_url)
    } catch {
      setUploadError('Could not upload photo. Try again.')
    } finally {
      setUploading(false)
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const token = await getAppToken()
      return usersApi.updateMe(
        {
          name: name.trim() || null,
          avatar_url: avatarUrl,
          ...(currentUser?.role === 'influencer' ? { handle: handle.trim() || null } : {}),
        },
        token,
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] })
      qc.invalidateQueries({ queryKey: ['influencers'] })
      setSaveMessage('Saved!')
      setTimeout(() => setSaveMessage(null), 3000)
    },
  })

  const deleteAccount = useMutation({
    mutationFn: async () => {
      const token = await getAppToken()
      return usersApi.deleteMe(token)
    },
    onSuccess: async () => {
      await supabase.auth.signOut()
      navigate('/explore')
    },
  })

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    qc.clear()
    navigate('/explore')
  }

  if (isLoading || !currentUser) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopNavBar />
      <main className="flex-1 mt-12 px-margin-mobile md:px-margin-desktop pt-10 pb-24 md:pb-12 overflow-y-auto">
        <div className="max-w-lg mx-auto flex flex-col gap-6">

          {/* Identity hero */}
          <div className="flex flex-col items-center pt-4 pb-8">
            <label className="relative cursor-pointer group mb-5">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-surface-container flex items-center justify-center">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-display-lg text-on-surface-variant italic" style={{ fontSize: 36 }}>
                    {(name || currentUser.email).charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              {/* Change photo overlay */}
              <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity font-label-caps text-white text-center leading-tight" style={{ fontSize: 9 }}>
                  Change
                </span>
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleAvatarSelect(file)
                }}
              />
            </label>

            {uploading && (
              <span className="flex items-center gap-2 font-body-sm text-body-sm text-secondary mb-2">
                <Spinner size={3} /> Uploading photo…
              </span>
            )}
            {uploadError && <p className="font-body-sm text-body-sm text-red-400 mb-2">{uploadError}</p>}

            <h1 className="font-display-lg text-on-surface italic leading-tight text-center" style={{ fontSize: 28 }}>
              {name || 'Your name'}
            </h1>
            {currentUser.role === 'influencer' && handle && (
              <p className="font-label-caps text-label-caps text-primary tracking-[0.15em] uppercase mt-1">
                @{handle}
              </p>
            )}
            <p className="font-body-sm text-body-sm text-secondary mt-1">{currentUser.email}</p>
            {currentUser.role === 'influencer' && (
              <span className="mt-3 rounded-full px-3 py-1 bg-primary/15 font-label-caps text-label-caps text-primary" style={{ fontSize: 9 }}>
                ★ Curator
              </span>
            )}
          </div>

          {/* Profile fields */}
          <div className="rounded-2xl bg-surface-container-lowest p-5 flex flex-col gap-4">
            <p className="font-label-caps text-label-caps text-secondary uppercase tracking-wider">Profile</p>

            <label className="flex flex-col gap-1.5">
              <span className="font-label-caps text-label-caps text-on-surface-variant">Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="rounded-xl bg-surface-container px-3 py-2.5 font-body-base text-body-base text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>

            {currentUser.role === 'influencer' && (
              <label className="flex flex-col gap-1.5">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Handle</span>
                <div className="flex items-center rounded-xl bg-surface-container overflow-hidden focus-within:ring-1 focus-within:ring-primary">
                  <span className="pl-3 pr-1 font-body-base text-body-base text-secondary select-none">@</span>
                  <input
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="yourhandle"
                    className="flex-1 py-2.5 pr-3 font-body-base text-body-base bg-transparent text-on-surface focus:outline-none"
                  />
                </div>
              </label>
            )}

            {save.isError && (
              <p className="font-body-sm text-body-sm text-red-400">
                {save.error instanceof Error ? save.error.message : 'Could not save changes.'}
              </p>
            )}

            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || uploading}
              className="w-full rounded-xl py-2.5 bg-primary text-on-primary font-label-caps text-label-caps tracking-wider hover:bg-primary-container transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {save.isPending ? <><Spinner size={4} /> Saving…</> : saveMessage ? '✓ Saved' : 'Save changes'}
            </button>
          </div>

          {/* Account actions */}
          <div className="rounded-2xl bg-surface-container-lowest p-5 flex flex-col gap-3">
            <p className="font-label-caps text-label-caps text-secondary uppercase tracking-wider">Account</p>
            <button
              onClick={handleSignOut}
              className="w-full rounded-xl py-2.5 bg-surface-container font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
            >
              Sign out
            </button>
          </div>

          {/* Danger zone — demoted, not alarming */}
          <div className="px-1 pb-4">
            <p className="font-label-caps text-label-caps text-secondary uppercase tracking-wider mb-3">Danger zone</p>
            <p className="font-body-sm text-body-sm text-secondary leading-relaxed mb-4">
              Deleting your account permanently removes your profile, pins, follows, and saved places. This cannot be undone.
            </p>

            {!confirmingDelete ? (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="font-label-caps text-label-caps text-red-400/70 hover:text-red-400 uppercase tracking-wider transition-colors"
              >
                Delete my account
              </button>
            ) : (
              <div className="rounded-2xl bg-red-950/30 p-4 flex flex-col gap-3">
                <p className="font-body-sm text-body-sm text-on-surface">
                  Are you sure? There's no going back.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => deleteAccount.mutate()}
                    disabled={deleteAccount.isPending}
                    className="rounded-xl px-4 py-2 bg-red-600 text-white font-label-caps text-label-caps uppercase tracking-wider hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {deleteAccount.isPending ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    className="rounded-xl px-4 py-2 bg-surface-container font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-container-high transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                {deleteAccount.isError && (
                  <p className="font-body-sm text-body-sm text-red-400">Could not delete account. Try again.</p>
                )}
              </div>
            )}
          </div>

        </div>
      </main>
      <BottomNavBar />
    </div>
  )
}
