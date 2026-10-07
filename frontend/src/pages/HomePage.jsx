import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { errorMessages } from '../api/client.js'
import { getMe } from '../api/user.js'
import Alert from '../components/ui/Alert.jsx'
import Button from '../components/ui/Button.jsx'
import { CheckCircleIcon } from '../components/ui/icons.jsx'
import Logo from '../components/ui/Logo.jsx'
import { useAuthStore } from '../store/authStore.js'

export default function HomePage() {
  const navigate = useNavigate()
  const user = useAuthStore((store) => store.user)
  const setUser = useAuthStore((store) => store.setUser)
  const logout = useAuthStore((store) => store.logout)
  const [loadError, setLoadError] = useState(null)
  const [loggingOut, setLoggingOut] = useState(false)

  // GET /user/me with the access token; an expired token is refreshed on the way
  useEffect(() => {
    let ignore = false
    getMe()
      .then((me) => {
        if (!ignore) setUser(me)
      })
      .catch((error) => {
        // A 401 means the session is over, and ProtectedRoute already redirects
        if (!ignore && error.status !== 401) {
          setLoadError(errorMessages(error).join(' '))
        }
      })
    return () => {
      ignore = true
    }
  }, [setUser])

  async function handleLogout() {
    setLoggingOut(true)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Logo />
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-500 sm:inline">
              Logged in as{' '}
              <span className="font-medium text-slate-900">{user?.username}</span>
            </span>
            <Button variant="secondary" loading={loggingOut} onClick={handleLogout}>
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Welcome, {user?.username}!
        </h1>
        <p className="mt-2 text-slate-600">
          You're logged in. Listings and more are coming soon.
        </p>

        {loadError && (
          <div className="mt-6 max-w-md">
            <Alert type="error" title="Couldn't load your account">
              {loadError}
            </Alert>
          </div>
        )}

        <section className="mt-8 max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-base font-semibold text-slate-900">Your account</h2>
          <dl className="mt-4 divide-y divide-slate-100 text-sm">
            <AccountRow label="Username">{user?.username}</AccountRow>
            <AccountRow label="Email">{user?.email}</AccountRow>
            <AccountRow label="Email status">
              {user?.emailVerified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700 ring-1 ring-emerald-200">
                  <CheckCircleIcon className="size-4" />
                  Verified
                </span>
              )}
            </AccountRow>
          </dl>
        </section>
      </main>
    </div>
  )
}

function AccountRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="truncate font-medium text-slate-900">{children}</dd>
    </div>
  )
}
