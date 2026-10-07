import { Navigate, Outlet } from 'react-router'
import FullPageSpinner from '../components/ui/FullPageSpinner.jsx'
import { useAuthStore } from '../store/authStore.js'

// Pages for logged-in users; anyone else goes to the login page
export default function ProtectedRoute() {
  const status = useAuthStore((store) => store.status)

  if (status === 'checking') return <FullPageSpinner />
  if (status === 'guest') return <Navigate to="/login" replace />
  return <Outlet />
}
