import { Navigate } from 'react-router-dom'
import { useSession } from '@/lib/useSession'
import { Spinner } from './Spinner'

interface Props {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: Props) {
  const session = useSession()

  if (session === undefined) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Spinner />
      </div>
    )
  }

  if (!session) return <Navigate to="/explore" replace />

  return <>{children}</>
}
