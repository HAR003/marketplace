import { Navigate, Outlet } from 'react-router'
import FullPageSpinner from '../components/ui/FullPageSpinner.jsx'
import { useAuthStore } from '../store/authStore.js'

// Login and registration; a logged-in user goes straight to Home
export default function GuestRoute() {
  const status = useAuthStore((store) => store.status)

  if (status === 'checking') return <FullPageSpinner />
  if (status === 'authenticated') return <Navigate to="/" replace />
  return <Outlet />
}
