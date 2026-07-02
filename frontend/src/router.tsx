import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ExplorePage } from '@/pages/ExplorePage'
import { InfluencerPage } from '@/pages/InfluencerPage'
import { SavedPage } from '@/pages/SavedPage'
import { FollowingPage } from '@/pages/FollowingPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ProtectedRoute } from '@/components/ui/ProtectedRoute'
import { InstallBanner } from '@/components/ui/InstallBanner'
import { PersistentMapPage } from '@/components/ui/PersistentMapPage'

export function AppRouter() {
  return (
    <BrowserRouter>
      <InstallBanner />
      {/* Mounted outside <Routes> and toggled with CSS — see PersistentMapPage */}
      <PersistentMapPage />
      <Routes>
        <Route path="/" element={<Navigate to="/explore" replace />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/i/:handle" element={<InfluencerPage />} />
        <Route
          path="/saved"
          element={
            <ProtectedRoute>
              <SavedPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/following"
          element={
            <ProtectedRoute>
              <FollowingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
