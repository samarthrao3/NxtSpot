import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ExplorePage } from '@/pages/ExplorePage'
import { InfluencerPage } from '@/pages/InfluencerPage'
import { MapPage } from '@/pages/MapPage'
import { SavedPage } from '@/pages/SavedPage'
import { ProtectedRoute } from '@/components/ui/ProtectedRoute'

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/explore" replace />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/i/:handle" element={<InfluencerPage />} />
        <Route
          path="/map"
          element={
            <ProtectedRoute>
              <MapPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/saved"
          element={
            <ProtectedRoute>
              <SavedPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
