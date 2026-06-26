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

  if (isLoading || !currentUser) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <TopNavBar />
      <main className="flex-1 mt-12 overflow-hidden px-margin-mobile md:px-margin-desktop pt-6 pb-20 md:pb-6">
        <div className="max-w-xl mx-auto flex flex-col gap-4">
          <h1 className="font-headline-md text-headline-md text-on-surface">Settings</h1>

          <div className="flex flex-col gap-4 border border-outline-variant p-5 bg-surface">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full overflow-hidden border border-outline-variant bg-surface-container flex items-center justify-center shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-headline-sm text-headline-sm text-on-surface-variant">
                    {(name || currentUser.email).charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <label className="flex flex-col gap-1">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Avatar</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleAvatarSelect(file)
                  }}
                  className="font-body-sm text-body-sm text-on-surface-variant"
                />
                {uploading && (
                  <span className="flex items-center gap-2 font-body-sm text-body-sm text-secondary">
                    <Spinner size={4} /> Uploading…
                  </span>
                )}
                {uploadError && <span className="font-body-sm text-body-sm text-red-600">{uploadError}</span>}
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="font-label-caps text-label-caps text-on-surface-variant">Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border border-outline-variant px-3 py-2 font-body-base text-body-base bg-surface text-on-surface"
              />
            </label>

            {currentUser.role === 'influencer' && (
              <label className="flex flex-col gap-1">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Handle</span>
                <div className="flex items-center border border-outline-variant bg-surface">
                  <span className="px-3 font-body-base text-body-base text-secondary">@</span>
                  <input
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    className="flex-1 py-2 pr-3 font-body-base text-body-base bg-surface text-on-surface outline-none"
                  />
                </div>
              </label>
            )}

            {save.isError && (
              <p className="font-body-sm text-body-sm text-red-600">
                {save.error instanceof Error ? save.error.message : 'Could not save changes.'}
              </p>
            )}
            {saveMessage && <p className="font-body-sm text-body-sm text-primary">{saveMessage}</p>}

            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || uploading}
              className="w-full py-3 bg-[#1A1A1A] text-white font-label-caps text-label-caps tracking-wider hover:bg-[#333333] transition-colors border border-[#1A1A1A] disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>

          <div className="border border-red-300 p-5 bg-surface flex flex-col gap-3">
            <h2 className="font-headline-sm text-headline-sm text-red-600">Delete Account</h2>
            <p className="font-body-base text-body-base text-secondary">
              This permanently deletes your account, pins, follows, and saved places. This cannot be undone.
            </p>

            {!confirmingDelete ? (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="self-start font-label-caps text-label-caps uppercase tracking-wider text-red-600 hover:text-red-700 transition-colors"
              >
                Delete my account
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="font-body-base text-body-base text-on-surface">
                  Are you sure? This cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => deleteAccount.mutate()}
                    disabled={deleteAccount.isPending}
                    className="py-2 px-4 bg-red-600 text-white font-label-caps text-label-caps uppercase tracking-wider hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {deleteAccount.isPending ? 'Deleting…' : 'Yes, delete my account'}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    className="py-2 px-4 border border-outline-variant font-label-caps text-label-caps uppercase tracking-wider text-on-surface hover:bg-surface-container transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                {deleteAccount.isError && (
                  <p className="font-body-sm text-body-sm text-red-600">Could not delete account. Try again.</p>
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
