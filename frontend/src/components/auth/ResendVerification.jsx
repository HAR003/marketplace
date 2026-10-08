import { useEffect, useState } from 'react'
import { resendVerification } from '../../api/auth.js'
import { errorMessages } from '../../api/client.js'
import Button from '../ui/Button.jsx'
import TextField from '../ui/TextField.jsx'

const COOLDOWN_SECONDS = 60

// Asks the backend for a new verification email, asking for the email address
// when none is passed in. The backend gives the same answer whether or not the
// account exists, and the cooldown keeps the button from flooding the inbox.
export default function ResendVerification({ email }) {
  const [typedEmail, setTypedEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (secondsLeft === 0) return
    const timer = setTimeout(() => setSecondsLeft((left) => left - 1), 1000)
    return () => clearTimeout(timer)
  }, [secondsLeft])

  const target = (email ?? typedEmail).trim().toLowerCase()

  async function handleSubmit(event) {
    event.preventDefault()
    if (!target) return

    setSending(true)
    setResult(null)
    try {
      const { message } = await resendVerification(target)
      setResult({ ok: true, text: message })
      setSecondsLeft(COOLDOWN_SECONDS)
    } catch (error) {
      setResult({ ok: false, text: errorMessages(error).join(' ') })
    } finally {
      setSending(false)
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-3">
      {email === undefined && (
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={typedEmail}
          onChange={(event) => setTypedEmail(event.target.value)}
        />
      )}
      <Button
        type="submit"
        variant="secondary"
        loading={sending}
        disabled={!target || secondsLeft > 0}
        className="w-full"
      >
        {secondsLeft > 0
          ? `Send again in ${secondsLeft}s`
          : 'Send a new verification link'}
      </Button>
      {result && (
        <p
          role="status"
          className={`text-sm ${result.ok ? 'text-emerald-700' : 'text-red-600'}`}
        >
          {result.text}
        </p>
      )}
    </form>
  )
}
