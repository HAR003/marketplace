import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { verifyEmail } from '../api/auth.js'
import FullPageSpinner from '../components/ui/FullPageSpinner.jsx'

// The link in the verification email opens this page. It verifies the token,
// then always continues to the login page, which shows the result.
export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const started = useRef(false)

  useEffect(() => {
    // StrictMode runs effects twice in development; verify only once
    if (started.current) return
    started.current = true

    const token = searchParams.get('token')
    const verification = token
      ? verifyEmail(token)
      : Promise.reject(new Error('The link has no token'))

    verification
      .then(() => ({ emailVerified: true }))
      .catch(() => ({ verificationFailed: true }))
      // replace: the token URL doesn't stay in the browser history
      .then((state) => navigate('/login', { replace: true, state }))
  }, [navigate, searchParams])

  return <FullPageSpinner label="Verifying your email…" />
}
