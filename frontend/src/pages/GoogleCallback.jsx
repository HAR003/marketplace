import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { googleLogin } from '../api/auth.js'
import { errorMessages } from '../api/client.js'
import {
  GOOGLE_CHANNEL,
  GOOGLE_STATE_KEY,
} from '../components/auth/GoogleLoginButton.jsx'
import FullPageSpinner from '../components/ui/FullPageSpinner.jsx'

// Google sends the sign-in popup here with a one-time code. This page hands
// the code to the backend, which answers with the refresh cookie, then tells
// GoogleLoginButton in the main window how it went and closes the popup.
export default function GoogleCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const started = useRef(false)

  useEffect(() => {
    // StrictMode runs effects twice in development, and Google's code works only once
    if (started.current) return
    started.current = true

    signIn(searchParams).then((result) => {
      const channel = new BroadcastChannel(GOOGLE_CHANNEL)
      channel.postMessage(result)
      channel.close()
      window.close()
      // Still open: the page wasn't opened as the sign-in popup
      if (!window.closed) navigate('/login', { replace: true })
    })
  }, [navigate, searchParams])

  return <FullPageSpinner label="Signing in with Google…" />
}

// Resolves to the message for GoogleLoginButton:
// { type: 'success' } or { type: 'error', message }
async function signIn(searchParams) {
  const expectedState = localStorage.getItem(GOOGLE_STATE_KEY)
  localStorage.removeItem(GOOGLE_STATE_KEY)

  // e.g. access_denied when the user cancels on Google's page
  if (searchParams.get('error')) {
    return { type: 'error', message: 'Google sign-in was cancelled.' }
  }
  const code = searchParams.get('code')
  // Only the sign-in GoogleLoginButton started may complete: this stops a
  // code from someone else's sign-in from logging this browser in as them
  if (!code || !expectedState || searchParams.get('state') !== expectedState) {
    return {
      type: 'error',
      message: "Couldn't sign in with Google. Please try again.",
    }
  }

  try {
    await googleLogin(code)
    return { type: 'success' }
  } catch (error) {
    return { type: 'error', message: errorMessages(error).join(' ') }
  }
}
