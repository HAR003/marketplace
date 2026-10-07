import { Link } from 'react-router'
import { MailIcon } from '../ui/icons.jsx'
import ResendVerification from './ResendVerification.jsx'

// Shown instead of the registration form once the account exists
export default function CheckEmailNotice({ email, username }) {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 rounded-xl bg-indigo-50 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-indigo-600 shadow-xs">
          <MailIcon className="size-5" />
        </span>
        <p className="text-sm text-slate-700">
          We sent a verification link to{' '}
          <span className="font-semibold break-all text-slate-900">{email}</span>.
          Open it to activate your account. The link expires in 15 minutes.
        </p>
      </div>

      <div>
        <p className="mb-3 text-sm text-slate-500">
          Didn't get the email? Check your spam folder, or send a new link.
        </p>
        <ResendVerification username={username} />
      </div>

      <Link
        to="/login"
        className="block text-center text-sm font-semibold text-indigo-600 hover:text-indigo-500"
      >
        Back to log in
      </Link>
    </div>
  )
}
