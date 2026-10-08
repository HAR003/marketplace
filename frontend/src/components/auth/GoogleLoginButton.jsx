import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuthStore } from '../../store/authStore.js'
import Alert from '../ui/Alert.jsx'
import Button from '../ui/Button.jsx'

// Shared with GoogleCallback, which runs in the popup
export const GOOGLE_CHANNEL = 'google-sign-in'
export const GOOGLE_STATE_KEY = 'google_oauth_state'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const POPUP_WIDTH = 500
const POPUP_HEIGHT = 600

// "Continue with Google" with an "or" divider above it. Google shows its own
// account chooser in a popup and then sends the popup to GoogleCallback. That
// page hands the code to the backend, which sets the refresh cookie, and
// reports back here on a BroadcastChannel. The session itself comes from the
// usual refresh, so no token ever passes between the windows.
export default function GoogleLoginButton() {
  const navigate = useNavigate()
  const refreshSession = useAuthStore((store) => store.refreshSession)
  const [error, setError] = useState(null)
  const [finishing, setFinishing] = useState(false)

  useEffect(() => {
    const channel = new BroadcastChannel(GOOGLE_CHANNEL)
    channel.onmessage = async ({ data }) => {
      if (data.type !== 'success') {
        setError(data.message)
        return
      }
      setFinishing(true)
      if (await refreshSession()) {
        navigate('/', { replace: true })
      } else {
        setFinishing(false)
        setError("Couldn't finish signing in with Google. Please try again.")
      }
    }
    return () => channel.close()
  }, [navigate, refreshSession])

  function handleClick() {
    setError(null)
    // GoogleCallback checks that Google sends this value back, so the popup
    // only completes a sign-in that this button started
    const state = crypto.randomUUID()
    localStorage.setItem(GOOGLE_STATE_KEY, state)

    const params = new URLSearchParams({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      redirect_uri: `${window.location.origin}/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email',
      state,
      // Always let the user pick the Google account
      prompt: 'select_account',
    })
    // Centered over this window
    const left = Math.round(
      window.screenX + (window.outerWidth - POPUP_WIDTH) / 2,
    )
    const top = Math.round(
      window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2,
    )
    const popup = window.open(
      `${GOOGLE_AUTH_URL}?${params}`,
      'google-sign-in',
      `popup,width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top}`,
    )
    if (popup) {
      popup.focus()
    } else {
      setError('Allow pop-ups for this site to continue with Google.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-xs font-medium text-slate-400">
        <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
        or
        <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
      </div>
      {error && (
        <Alert type="error" title="Couldn't sign in with Google">
          {error}
        </Alert>
      )}
      <Button
        variant="secondary"
        loading={finishing}
        onClick={handleClick}
        className="w-full"
      >
        {!finishing && <GoogleLogo />}
        Continue with Google
      </Button>
    </div>
  )
}

// Google's multicolor "G"
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}
