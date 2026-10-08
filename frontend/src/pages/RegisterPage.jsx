import { useState } from 'react'
import { Link } from 'react-router'
import { register } from '../api/auth.js'
import { errorMessages } from '../api/client.js'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import CheckEmailNotice from '../components/auth/CheckEmailNotice.jsx'
import GoogleLoginButton from '../components/auth/GoogleLoginButton.jsx'
import Alert from '../components/ui/Alert.jsx'
import Button from '../components/ui/Button.jsx'
import PasswordField from '../components/ui/PasswordField.jsx'
import TextField from '../components/ui/TextField.jsx'
import { validateRegistration } from '../utils/validation.js'

const EMPTY_FORM = { username: '', email: '', password: '', confirmPassword: '' }

export default function RegisterPage() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [serverErrors, setServerErrors] = useState([])
  const [submitting, setSubmitting] = useState(false)
  // The new account, once the backend has created it and sent the email
  const [account, setAccount] = useState(null)

  const update = (field) => (event) => {
    setForm({ ...form, [field]: event.target.value })
    setErrors({ ...errors, [field]: undefined })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const found = validateRegistration(form)
    setErrors(found)
    setServerErrors([])
    if (Object.keys(found).length > 0) return

    const details = {
      username: form.username.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
    }
    setSubmitting(true)
    try {
      await register(details)
      setAccount({ email: details.email })
    } catch (error) {
      if (error.status === 409) {
        setErrors({ email: 'An account with this email already exists.' })
      } else {
        setServerErrors(errorMessages(error))
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (account) {
    return (
      <AuthLayout
        title="Check your inbox"
        subtitle="One more step to activate your account."
      >
        <CheckEmailNotice email={account.email} />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join Marketplace to start buying and selling."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-semibold text-indigo-600 hover:text-indigo-500"
          >
            Log in
          </Link>
        </>
      }
    >
      <div className="space-y-6">
        <form noValidate onSubmit={handleSubmit} className="space-y-5">
          {serverErrors.length > 0 && (
            <Alert type="error" title="Couldn't create your account">
              {serverErrors.join(' ')}
            </Alert>
          )}
          <TextField
            label="Username"
            name="username"
            autoComplete="username"
            autoFocus
            value={form.username}
            onChange={update('username')}
            error={errors.username}
            hint="3–30 characters: letters, numbers, dots, dashes or underscores."
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={update('email')}
            error={errors.email}
          />
          <PasswordField
            label="Password"
            name="password"
            autoComplete="new-password"
            value={form.password}
            onChange={update('password')}
            error={errors.password}
            hint="At least 8 characters."
          />
          <PasswordField
            label="Confirm password"
            name="confirmPassword"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={update('confirmPassword')}
            error={errors.confirmPassword}
          />
          <Button type="submit" loading={submitting} className="w-full">
            Create account
          </Button>
        </form>

        <GoogleLoginButton />
      </div>
    </AuthLayout>
  )
}
