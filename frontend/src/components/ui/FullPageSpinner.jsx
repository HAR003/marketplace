import Spinner from './Spinner.jsx'

// Fills the screen while something has to finish first,
// e.g. restoring the session after a page load
export default function FullPageSpinner({ label = 'Loading…' }) {
  return (
    <div
      role="status"
      className="flex min-h-screen flex-col items-center justify-center gap-3 text-slate-500"
    >
      <Spinner className="size-8 text-indigo-600" />
      <p className="text-sm">{label}</p>
    </div>
  )
}
