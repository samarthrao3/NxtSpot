import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '@/lib/useSession'
import { MapPage } from '@/pages/MapPage'
import { Spinner } from './Spinner'

// Renders MapPage as a permanent sibling of <Routes> and toggles it with CSS
// instead of letting React Router mount/unmount it. Router-driven unmounting
// tears down the Mapbox GL WebGL context and every marker, then rebuilds them
// (plus refetches the style/sprite/glyphs/tiles) on every return trip to
// /map — expensive on mobile GPUs/networks. Keeping it mounted makes
// switching back to /map instant.
export function PersistentMapPage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const session = useSession()
  const isMapRoute = pathname === '/map'
  const [everMounted, setEverMounted] = useState(false)

  useEffect(() => {
    if (isMapRoute && session) setEverMounted(true)
    if (session === null) setEverMounted(false)
  }, [isMapRoute, session])

  useEffect(() => {
    if (isMapRoute && session === null) navigate('/explore', { replace: true })
  }, [isMapRoute, session, navigate])

  if (isMapRoute && session === undefined) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Spinner />
      </div>
    )
  }

  if (!everMounted) return null

  return (
    <div className={isMapRoute ? '' : 'hidden'}>
      <MapPage />
    </div>
  )
}
