import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { errorMessages } from '../api/client.js'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import GoogleLoginButton from '../components/auth/GoogleLoginButton.jsx'
import ResendVerification from '../components/auth/ResendVerification.jsx'
import Alert from '../components/ui/Alert.jsx'
import Button from '../components/ui/Button.jsx'
import PasswordField from '../components/ui/PasswordField.jsx'
import TextField from '../components/ui/TextField.jsx'
import { useAuthStore } from '../store/authStore.js'
import { validateLogin } from '../utils/validation.js'

export default function LoginPage() {
  const navigate = useNavigate()
  // VerifyEmailPage sends { emailVerified } or { verificationFailed } here
  const { state } = useLocation()
  const login = useAuthStore((store) => store.login)

  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  // After a failed login: { unverifiedEmail } or { messages }
  const [failure, setFailure] = useState(null)

  const update = (field) => (event) => {
    setForm({ ...form, [field]: event.target.value })
    setErrors({ ...errors, [field]: undefined })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const found = validateLogin(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const email = form.email.trim().toLowerCase()
    setSubmitting(true)
    setFailure(null)
    try {
      await login({ email, password: form.password })
      navigate('/', { replace: true })
    } catch (error) {
      setSubmitting(false)
      if (error.status === 401 && error.message === 'Email not verified') {
        setFailure({ unverifiedEmail: email })
      } else if (error.status === 401) {
        setFailure({ messages: ['Incorrect email or password.'] })
      } else {
        setFailure({ messages: errorMessages(error) })
      }
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to your Marketplace account."
      footer={
        <>
          Don't have an account?{' '}
          <Link
            to="/register"
            className="font-semibold text-indigo-600 hover:text-indigo-500"
          >
            Create one
          </Link>
        </>
      }
    >
      <div className="space-y-6">
        <LoginNotice state={state} failure={failure} />

        <form noValidate onSubmit={handleSubmit} className="space-y-5">
          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            value={form.email}
            onChange={update('email')}
            error={errors.email}
          />
          <PasswordField
            label="Password"
            name="password"
            autoComplete="current-password"
            value={form.password}
            onChange={update('password')}
            error={errors.password}
          />
          <Button type="submit" loading={submitting} className="w-full">
            Log in
          </Button>
        </form>

        <GoogleLoginButton />
      </div>
    </AuthLayout>
  )
}

// The message above the form: the last login attempt's problem if there is
// one, otherwise the result of opening the verification link
function LoginNotice({ state, failure }) {
  if (failure?.unverifiedEmail) {
    return (
      <Alert type="warning" title="Verify your email first">
        <p>Open the link we emailed you when you registered, then log in again.</p>
        <div className="mt-3">
          <ResendVerification email={failure.unverifiedEmail} />
        </div>
      </Alert>
    )
  }
  if (failure) {
    return (
      <Alert type="error" title="Couldn't log in">
        {failure.messages.join(' ')}
      </Alert>
    )
  }
  if (state?.emailVerified) {
    return (
      <Alert type="success" title="Email verified">
        Your email has been verified. You can now log in.
      </Alert>
    )
  }
  if (state?.verificationFailed) {
    return (
      <Alert type="error" title="This link is invalid or has expired">
        <p>Enter your email and we'll send you a new verification link.</p>
        <div className="mt-3">
          <ResendVerification />
        </div>
      </Alert>
    )
  }
  return null
}
